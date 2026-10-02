// The primitives feature api/ hooks compose (data-layer §9.2). Features never build DataState by
// hand. Decision tables: §9.2.1 (records) and §9.2.2 (collections).
import { useCallback, useRef, useState, useSyncExternalStore } from "react"
import type { DependencyList } from "react"
import { toAppError } from "@/lib/errors"
import type { AppError } from "@/lib/errors"
import { uuidv7Time } from "@/lib/ids"
import { logger } from "@/lib/logger"
import type { ScopeInfo } from "@/lib/sync/scope-info"
import { useDataRuntime } from "./data-runtime"
import type { DataState, MissingReason } from "./data-state"
import { useLive } from "./use-live"

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

function useCanSync(): boolean {
  const { canSync, subscribeSync } = useDataRuntime()
  return useSyncExternalStore(subscribeSync, canSync, canSync)
}

/** One retry key per hook: bumping it re-subscribes the live query. */
function useRetry() {
  const [key, setKey] = useState(0)
  return { key, retry: useCallback(() => setKey((k) => k + 1), []) }
}

function errorState(
  error: unknown,
  retry: () => void,
  logged: { current: unknown }
): DataState<never> {
  const appError: AppError = toAppError(error)
  if (logged.current !== error) {
    logged.current = error
    logger.error("data", "read failed", {
      code: appError.code,
      error: String(error),
    })
  }
  return { status: "error", error: appError, retry }
}

/** Reuse previous row objects whose key didn't change, so memoized rows don't re-render (§9.3). */
function useStructuralShare<TRow>(
  rows: ReadonlyArray<TRow> | undefined,
  key: (row: TRow) => string
) {
  const prev = useRef<{
    rows: ReadonlyArray<TRow>
    byKey: Map<string, TRow>
  } | null>(null)
  if (!rows) return rows
  const byKey = new Map<string, TRow>()
  let changed = !prev.current || prev.current.rows.length !== rows.length
  const next = rows.map((row, i) => {
    const k = key(row)
    const old = prev.current?.byKey.get(k)
    const out = old ?? row
    byKey.set(k, out)
    if (!changed && prev.current?.rows[i] !== out) changed = true
    return out
  })
  if (!changed && prev.current) return prev.current.rows
  prev.current = { rows: next, byKey }
  return next
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
  const { key, retry } = useRetry()
  const logged = useRef<unknown>(null)
  const allowed = opts.allowed ?? true
  const result = useLive(opts.enabled && allowed ? opts.query : null, [
    ...opts.deps,
    key,
  ])
  const shared = useStructuralShare(
    result?.kind === "ok" ? result.value : undefined,
    opts.share ?? (defaultShareKey as (row: TRow) => string)
  )

  if (!opts.enabled) return { status: "idle" }
  if (!allowed || scopes.some((s) => s.forbidden))
    return { status: "missing", reason: "forbidden" }
  if (!result) return { status: "loading" }
  if (result.kind === "error") return errorState(result.error, retry, logged)
  const rows = shared ?? []
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
  const logged = useRef<unknown>(null)
  const requested = useRef<{ id: string; at: number } | null>(null)
  const allowed = opts.allowed ?? true

  const result = useLive<RecordResult<TRecord>>(
    opts.enabled && allowed
      ? async () => {
          const value = await opts.query()
          if (value !== undefined) return { found: true, value }
          // only on the miss path: one extra read each
          const deleted = opts.id
            ? (await runtime.db.tombstones.get([
                opts.source.entity,
                opts.id,
              ])) !== undefined
            : false
          return {
            found: false,
            deleted,
            explained: await opts.explainMissing?.(),
          }
        }
      : null,
    [...opts.deps, key]
  )

  if (!opts.enabled) return { status: "idle" }
  if (!allowed || scope?.forbidden)
    return { status: "missing", reason: "forbidden" }
  if (!result) return { status: "loading" }
  if (result.kind === "error") return errorState(result.error, retry, logged)
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
    return notSynced(runtime, opts.id, requested)
  const created = opts.id ? uuidv7Time(opts.id) : null
  const skew = runtime.clockSkewMs?.() ?? 0
  if (
    created !== null &&
    created > scope.lastPulledAt - skew - NOT_SYNCED_GRACE_MS
  )
    return notSynced(runtime, opts.id, requested)
  if (r.explained) return { status: "missing", reason: r.explained }
  return { status: "missing", reason: "not-found" }
}

/** Ask the engine once per id per minute; the live query flips to success when it lands. */
function notSynced(
  runtime: ReturnType<typeof useDataRuntime>,
  id: string | undefined,
  requested: { current: { id: string; at: number } | null }
): DataState<never> {
  const now = Date.now()
  const key = id ?? ""
  if (
    runtime.requestSync &&
    (requested.current?.id !== key ||
      now - requested.current.at > REQUEST_THROTTLE_MS)
  ) {
    requested.current = { id: key, at: now }
    queueMicrotask(() => runtime.requestSync?.())
  }
  return { status: "missing", reason: "not-synced" }
}
