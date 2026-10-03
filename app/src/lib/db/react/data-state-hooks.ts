// The primitives feature api/ hooks compose (data-layer §9.2). Features never build DataState by
// hand. Decision tables: §9.2.1 (records) and §9.2.2 (collections).
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import type { DependencyList } from "react"
import { toAppError } from "@/lib/errors"
import { uuidv7Time } from "@/lib/ids"
import { logger } from "@/lib/logger"
import type { ScopeInfo } from "@/lib/sync/scope-info"
import { useDataRuntime } from "./data-runtime"
import type { DataState, MissingReason } from "./data-state"
import { liveCacheKey, useLive } from "./use-live"
import type { Settled } from "./use-live"

export interface ScopeRef {
  scope: string
  entity: string
}

const NOT_SYNCED_GRACE_MS = 5_000
const REQUEST_THROTTLE_MS = 60_000

function isScopeList(
  source: ScopeRef | ReadonlyArray<ScopeRef>
): source is ReadonlyArray<ScopeRef> {
  return Array.isArray(source)
}

function useScopes(
  source: ScopeRef | ReadonlyArray<ScopeRef>
): Array<ScopeInfo> {
  const { scopeInfo } = useDataRuntime()
  useSyncExternalStore(
    scopeInfo.subscribe,
    scopeInfo.version,
    scopeInfo.version
  )
  const list: ReadonlyArray<ScopeRef> = isScopeList(source) ? source : [source]
  return list.map((s) => scopeInfo.get(s.scope, s.entity))
}

/** The scope and entity names, part of a query's cache key. */
function sourceParts(
  source: ScopeRef | ReadonlyArray<ScopeRef>
): Array<string> {
  const list: ReadonlyArray<ScopeRef> = isScopeList(source) ? source : [source]
  return list.map((s) => `${s.scope}/${s.entity}`)
}

function useCanSync(): boolean {
  const { canSync, subscribeSync } = useDataRuntime()
  return useSyncExternalStore(subscribeSync, canSync, canSync)
}

/** One retry key per hook: bumping it re-subscribes the live query. */
function useRetry() {
  const [key, setKey] = useState(0)
  return { key, retry: useCallback(() => setKey((k) => k + 1), []) }
}

/** Logs a read failure once per distinct error, after render. */
function useLogError(result: { kind: string; error?: unknown } | undefined) {
  const error = result?.kind === "error" ? result.error : undefined
  useEffect(() => {
    if (error !== undefined)
      logger.error("data", "read failed", {
        code: toAppError(error).code,
        error: String(error),
      })
  }, [error])
}

function errorState(error: unknown, retry: () => void): DataState<never> {
  return { status: "error", error: toAppError(error), retry }
}

/**
 * Structural sharing (§9.3), applied inside the querier (outside render): rows whose key didn't
 * change keep their previous object, and an unchanged list keeps its previous array, so memoized
 * rows don't re-render.
 */
function createSharer<TRow>(key: (row: TRow) => string) {
  let prevRows: ReadonlyArray<TRow> = []
  let prevByKey = new Map<string, TRow>()
  return (rows: ReadonlyArray<TRow>): ReadonlyArray<TRow> => {
    const byKey = new Map<string, TRow>()
    let changed = rows.length !== prevRows.length
    const next = rows.map((row, i) => {
      const k = key(row)
      const out = prevByKey.get(k) ?? row
      byKey.set(k, out)
      if (prevRows[i] !== out) changed = true
      return out
    })
    prevByKey = byKey
    if (!changed) return prevRows
    prevRows = next
    return next
  }
}

const defaultShareKey = (row: unknown): string => {
  const r = row as {
    id?: unknown
    key?: unknown
    rev?: unknown
    syncState?: unknown
    localUpdatedAt?: unknown
  }
  return `${String(r.id ?? r.key)}:${String(r.rev)}:${String(r.syncState)}:${String(r.localUpdatedAt)}`
}

export interface CollectionOptions<TRow> {
  /** false → idle: a required input is missing */
  enabled: boolean
  source: ScopeRef | ReadonlyArray<ScopeRef>
  /** client RBAC (UX only); false → missing / forbidden */
  allowed?: boolean
  query: () => Promise<ReadonlyArray<TRow>>
  deps: DependencyList
  share?: (row: TRow) => string
}

export function useCollectionState<TRow>(
  opts: CollectionOptions<TRow>
): DataState<ReadonlyArray<TRow>> {
  const scopes = useScopes(opts.source)
  const canSync = useCanSync()
  const { db } = useDataRuntime()
  const { key, retry } = useRetry()
  const allowed = opts.allowed ?? true
  const [share] = useState(() =>
    createSharer(opts.share ?? (defaultShareKey as (row: TRow) => string))
  )
  const { query } = opts
  const result = useLive(
    opts.enabled && allowed ? async () => share(await query()) : null,
    [...opts.deps, key],
    liveCacheKey(query, [db, ...sourceParts(opts.source), ...opts.deps])
  )
  useLogError(result)

  if (!opts.enabled) return { status: "idle" }
  if (!allowed || scopes.some((s) => s.forbidden))
    return { status: "missing", reason: "forbidden" }
  if (!result) return { status: "loading" }
  if (result.kind === "error") return errorState(result.error, retry)
  const rows = result.kind === "ok" ? result.value : []
  const bootstrapped = scopes.every((s) => s.bootstrapState === "done")
  if (rows.length > 0)
    return {
      status: "success",
      data: rows,
      ...(bootstrapped ? {} : { stale: true }),
    }
  if (bootstrapped) return { status: "empty" }
  // never synced: loading while the engine can sync, "not on this device yet" while it can't (ADR-045)
  return canSync
    ? { status: "loading" }
    : { status: "missing", reason: "not-synced" }
}

export interface RecordOptions<TRecord> {
  enabled: boolean
  source: ScopeRef
  allowed?: boolean
  query: () => Promise<TRecord | undefined>
  deps: DependencyList
  /** the record's id: enables the tombstone and UUIDv7 rules */
  id?: string
  /** a feature reason for an absent record, e.g. not-scouted (§9.2.1 rule 5) */
  explainMissing?: () => Promise<MissingReason | undefined>
}

type RecordResult<TRecord> =
  | { found: true; value: TRecord }
  | { found: false; deleted: boolean; explained: MissingReason | undefined }

export function useRecordState<TRecord>(
  opts: RecordOptions<TRecord>
): DataState<TRecord> {
  const runtime = useDataRuntime()
  const [scope] = useScopes(opts.source)
  const { key, retry } = useRetry()
  const allowed = opts.allowed ?? true
  const { db } = runtime
  const { query, explainMissing, id } = opts
  const entity = opts.source.entity

  const result = useLive<RecordResult<TRecord>>(
    opts.enabled && allowed
      ? async () => {
          const value = await query()
          if (value !== undefined) return { found: true, value }
          // only on the miss path: one extra read each
          const deleted = id
            ? (await db.tombstones.get([entity, id])) !== undefined
            : false
          return { found: false, deleted, explained: await explainMissing?.() }
        }
      : null,
    [...opts.deps, key],
    liveCacheKey(query, [db, ...sourceParts(opts.source), ...opts.deps])
  )
  useLogError(result)
  const state = recordState(result, {
    enabled: opts.enabled,
    allowed,
    scope,
    id,
    skew: runtime.clockSkewMs?.() ?? 0,
    retry,
  })
  useRequestWhenNotSynced(state, id, runtime.requestSync)
  return state
}

function recordState<TRecord>(
  result: Settled<RecordResult<TRecord>> | undefined,
  ctx: {
    enabled: boolean
    allowed: boolean
    scope: ScopeInfo | undefined
    id: string | undefined
    skew: number
    retry: () => void
  }
): DataState<TRecord> {
  const { scope } = ctx
  if (!ctx.enabled) return { status: "idle" }
  if (!ctx.allowed || scope?.forbidden)
    return { status: "missing", reason: "forbidden" }
  if (!result) return { status: "loading" }
  if (result.kind === "error") return errorState(result.error, ctx.retry)
  if (result.kind === "idle") return { status: "idle" }
  const r = result.value
  if (r.found)
    return {
      status: "success",
      data: r.value,
      ...(scope?.bootstrapState === "done" ? {} : { stale: true }),
    }
  if (r.deleted) return { status: "missing", reason: "not-found" }
  if (scope?.bootstrapState !== "done")
    return { status: "missing", reason: "not-synced" }
  const created = ctx.id ? uuidv7Time(ctx.id) : null
  if (
    created !== null &&
    created > scope.lastPulledAt - ctx.skew - NOT_SYNCED_GRACE_MS
  )
    return { status: "missing", reason: "not-synced" }
  if (r.explained) return { status: "missing", reason: r.explained }
  return { status: "missing", reason: "not-found" }
}

/** Ask the engine once per id per minute; the live query flips to success when the record lands. */
function useRequestWhenNotSynced(
  state: DataState<unknown>,
  id: string | undefined,
  requestSync: (() => void) | undefined
) {
  const last = useRef<{ id: string; at: number } | null>(null)
  const notSynced = state.status === "missing" && state.reason === "not-synced"
  useEffect(() => {
    if (!notSynced || !requestSync) return
    const now = Date.now()
    const key = id ?? ""
    if (last.current?.id === key && now - last.current.at < REQUEST_THROTTLE_MS)
      return
    last.current = { id: key, at: now }
    requestSync()
  }, [notSynced, id, requestSync])
}

/**
 * For values that always have a sensible default (preferences, our team number): the live value,
 * or `fallback` while loading or after a failed read (logged). Not for data a screen depends on:
 * those use the DataState hooks above.
 */
export function useLiveOr<TValue>(
  query: () => Promise<TValue>,
  deps: DependencyList,
  fallback: TValue
): TValue {
  const { db } = useDataRuntime()
  const result = useLive(query, deps, liveCacheKey(query, [db, ...deps]))
  useLogError(result)
  return result?.kind === "ok" ? result.value : fallback
}
