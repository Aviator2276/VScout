// The sync engine (data-layer §7): one run at a time per device, push → pull → push again.
// Framework-free; React reads `status` (useSyncExternalStore) and Dexie live queries only.
import type { ApiClient } from "@/lib/api/api-client"
import { OfflineError } from "@/lib/api/errors"
import type { Clock } from "@/lib/clock"
import type { EntityName } from "@/lib/contracts/entities"
import type { VScoutDB } from "@/lib/db/schema"
import type { IdGen } from "@/lib/ids"
import { logger } from "@/lib/logger"
import type { ExternalStore } from "@/lib/mqtt/external-store"
import type { GameLookup } from "./game-payload"
import { createIngest } from "./ingest"
import type { IngestResult } from "./ingest"
import { withSyncLock } from "./lock"
import type { SyncLockManager } from "./lock"
import { resetInflightOps } from "./outbox"
import { pullScope } from "./pull"
import { flushOutbox } from "./push"
import type { PushDeps } from "./push"
import type { ScopeInfoStore } from "./scope-info"
import { createSyncStatusStore } from "./status-store"
import type { SyncStatus } from "./status-store"

export type SyncReason =
  | "boot"
  | "visible"
  | "online"
  | "mqtt-reconnect"
  | "mqtt-control"
  | "interval"
  | "write"
  | "push"
  | "push-open"
  | "manual"
  | "event-switch"
  | "cache-reset"

export interface SyncSession {
  userId: string
  role: "admin" | "scouter" | "guest"
}

export interface EngineDeps {
  db: VScoutDB
  api: ApiClient
  clock: Clock
  ids: IdGen
  games: GameLookup
  session: () => SyncSession | null
  activeEventKey: () => string | null
  pinnedEventKeys?: () => ReadonlyArray<string>
  locks?: SyncLockManager
  random?: () => number
  onAuthLost?: () => void
  onUpgradeRequired?: () => void
  debounceMs?: { sync?: number; push?: number }
  /** the in-memory syncCursors mirror read by data-state hooks; refreshed after each pull */
  scopeInfo?: ScopeInfoStore
  /** foreground interval (data-layer §7.2); tests shorten it */
  intervalMs?: { idle: number; pending: number }
}

/** Pull order per scope (data-layer §7.1): hot first so lists render while the rest continues. */
export const SCOPE_GROUPS: Record<
  "global" | "user" | "event",
  ReadonlyArray<ReadonlyArray<EntityName>>
> = {
  global: [["teamSettings"], ["event", "team"]],
  user: [
    ["message", "comment", "reaction"],
    ["userSettings", "user"],
  ],
  event: [
    [
      "match",
      "scoutEntry",
      "comment",
      "message",
      "eventSettings",
      "allianceBoard",
      "picklist",
      "picklistEntry",
    ],
    [
      "eventTeam",
      "pitScouting",
      "postScouting",
      "allianceRank",
      "mediaAsset",
      "reaction",
    ],
  ],
}

const VISIBLE_THROTTLE_MS = 15_000
const INTERVAL_MS = 60_000
const INTERVAL_PENDING_MS = 30_000
/** these mean "I'm back": waiting ops are retried now, not after their backoff */
const CLEARS_BACKOFF: ReadonlySet<SyncReason> = new Set([
  "online",
  "visible",
  "manual",
])

export interface RunResult {
  outcome: "ok" | "busy" | "offline" | "auth" | "upgrade" | "error"
  sent: number
}

export interface SyncEngine {
  start: () => Promise<void>
  stop: () => void
  /** debounced and coalesced; never more than one run at a time */
  requestSync: (
    reason: SyncReason,
    opts?: { force?: boolean; entities?: ReadonlyArray<string> }
  ) => void
  requestPush: (reason: SyncReason) => void
  /** run now and wait (tests, pull-to-refresh) */
  syncNow: (
    reason: SyncReason,
    opts?: {
      force?: boolean
      entities?: ReadonlyArray<string>
      pushOnly?: boolean
    }
  ) => Promise<RunResult>
  /** MQTT entry point: decode + apply a batch in one transaction */
  ingestMany: (raws: Array<unknown>) => Promise<IngestResult>
  setVisible: (visible: boolean) => void
  status: ExternalStore<SyncStatus>
}

interface PendingRun {
  reason: SyncReason
  pushOnly: boolean
  /** undefined = every entity */
  entities?: ReadonlyArray<string>
}

/** The broadest of two requests: full beats push-only, all entities beat a subset. */
export function mergeRequests(a: PendingRun | null, b: PendingRun): PendingRun {
  if (!a) return b
  // a push-only request has no entity list; the other request's list (or none) wins
  const entities = a.pushOnly
    ? b.entities
    : b.pushOnly
      ? a.entities
      : a.entities && b.entities
        ? [...new Set([...a.entities, ...b.entities])]
        : undefined
  return {
    reason: b.reason,
    pushOnly: a.pushOnly && b.pushOnly,
    ...(entities ? { entities } : {}),
  }
}

export function createSyncEngine(deps: EngineDeps): SyncEngine {
  const status = createSyncStatusStore()
  const now = () => deps.clock.now()
  const applyCtx = {
    db: deps.db,
    games: deps.games,
    now,
    newId: () => deps.ids.newId(),
  }
  const ingest = createIngest(applyCtx)
  const pushDeps: PushDeps = {
    ...applyCtx,
    api: deps.api,
    session: deps.session,
    ...(deps.random ? { random: deps.random } : {}),
  }

  let running: Promise<RunResult> | null = null
  let rerun: PendingRun | null = null
  let syncTimer: ReturnType<typeof setTimeout> | null = null
  let pushTimer: ReturnType<typeof setTimeout> | null = null
  let intervalTimer: ReturnType<typeof setTimeout> | null = null
  let started = false
  let visible = true
  let lastSuccessAt = 0

  const setStatus = (patch: Partial<SyncStatus>) =>
    status.update((s) => ({ ...s, ...patch }))

  function scopes(session: SyncSession): Array<{
    scope: string
    groups: ReadonlyArray<ReadonlyArray<EntityName>>
  }> {
    const list: Array<{
      scope: string
      groups: ReadonlyArray<ReadonlyArray<EntityName>>
    }> = [
      { scope: "global", groups: SCOPE_GROUPS.global },
      {
        scope: "user",
        // guests have no server-side settings (ADR-066)
        groups:
          session.role === "guest"
            ? SCOPE_GROUPS.user.map((g) =>
                g.filter((e) => e !== "userSettings")
              )
            : SCOPE_GROUPS.user,
      },
    ]
    const events = new Set(
      [deps.activeEventKey(), ...(deps.pinnedEventKeys?.() ?? [])].filter(
        (e): e is string => !!e
      )
    )
    for (const ek of events)
      list.push({ scope: `event:${ek}`, groups: SCOPE_GROUPS.event })
    return list
  }

  async function clearBackoff() {
    await deps.db.outbox
      .where("state")
      .equals("queued")
      .modify({ nextAttemptAt: 0 })
  }

  async function runOnce(
    reason: SyncReason,
    opts: { pushOnly?: boolean; entities?: ReadonlyArray<string> }
  ): Promise<RunResult> {
    const session = deps.session()
    if (!session) return { outcome: "ok", sent: 0 }
    if (CLEARS_BACKOFF.has(reason)) await clearBackoff()

    setStatus({ phase: "pushing", leaderTab: true })
    let pushed = await flushOutbox(pushDeps)
    let sent = pushed.sent
    if (pushed.stoppedBy === "auth") {
      setStatus({ phase: "paused-auth" })
      deps.onAuthLost?.()
      return { outcome: "auth", sent }
    }
    if (pushed.stoppedBy === "upgrade") {
      setStatus({
        phase: "error",
        lastError: { message: "App update required", at: now() },
      })
      deps.onUpgradeRequired?.()
      return { outcome: "upgrade", sent }
    }
    if (pushed.stoppedBy === "offline") {
      setStatus({ phase: "offline" })
      return { outcome: "offline", sent }
    }

    if (!opts.pushOnly) {
      for (const { scope, groups } of scopes(session)) {
        for (const group of groups) {
          const entities = opts.entities
            ? group.filter((e) => opts.entities?.includes(e))
            : group
          if (entities.length === 0) continue
          const cursorRows = await deps.db.syncCursors
            .where("[scope+entity]")
            .anyOf(entities.map((e) => [scope, e]))
            .toArray()
          const bootstrapping =
            cursorRows.length < entities.length ||
            cursorRows.some((r) => r.bootstrapState !== "done")
          setStatus({ phase: bootstrapping ? "bootstrapping" : "pulling" })
          await pullScope(
            {
              ...applyCtx,
              api: deps.api,
              onProgress: (p) =>
                bootstrapping &&
                setStatus({
                  bootstrap: {
                    scope: p.scope,
                    entitiesDone: 0,
                    entitiesTotal: entities.length,
                    recordsApplied: p.recordsApplied,
                  },
                }),
            },
            scope,
            entities
          )
          await deps.scopeInfo?.refresh()
        }
      }
    }

    // writes made during the pull, or settings rebased after a 409
    // a flush that stopped (rate limit, 5xx backoff) waits for the next run
    const stopped = pushed.stoppedBy !== null
    const wroteDuringPull =
      !opts.pushOnly &&
      (await deps.db.outbox
        .where("state")
        .equals("queued")
        .filter((o) => o.nextAttemptAt <= now())
        .count()) > 0
    if (!stopped && (pushed.needsRerun || wroteDuringPull)) {
      pushed = await flushOutbox(pushDeps)
      sent += pushed.sent
    }
    lastSuccessAt = now()
    setStatus({ phase: "idle", lastSuccessAt, bootstrap: undefined })
    return { outcome: "ok", sent }
  }

  async function run(
    reason: SyncReason,
    opts: { pushOnly?: boolean; entities?: ReadonlyArray<string> } = {}
  ): Promise<RunResult> {
    try {
      const result = await withSyncLock(deps.locks, () => runOnce(reason, opts))
      if (result === "busy") {
        setStatus({ leaderTab: false })
        return { outcome: "busy", sent: 0 }
      }
      return result
    } catch (error) {
      const offline = error instanceof OfflineError
      setStatus({
        phase: offline ? "offline" : "error",
        lastError: { message: String(error), at: now() },
      })
      if (!offline)
        logger.error("sync", "sync run failed", {
          reason,
          error: String(error),
        })
      return { outcome: offline ? "offline" : "error", sent: 0 }
    }
  }

  function syncNow(
    reason: SyncReason,
    opts: {
      force?: boolean
      entities?: ReadonlyArray<string>
      pushOnly?: boolean
    } = {}
  ): Promise<RunResult> {
    if (running) {
      // coalesce: one more run after the current one, covering everything that was asked for
      rerun = mergeRequests(rerun, {
        reason,
        pushOnly: opts.pushOnly ?? false,
        ...(opts.entities ? { entities: opts.entities } : {}),
      })
      return running
    }
    running = (async () => {
      let result = await run(reason, opts)
      while (rerun) {
        const next = rerun
        rerun = null
        result = await run(next.reason, {
          pushOnly: next.pushOnly,
          ...(next.entities ? { entities: next.entities } : {}),
        })
      }
      running = null
      scheduleInterval()
      return result
    })()
    return running
  }

  function scheduleInterval() {
    if (!started) return
    if (intervalTimer) clearTimeout(intervalTimer)
    void deps.db.outbox.count().then((pending) => {
      if (!started) return
      intervalTimer = setTimeout(
        () => {
          if (visible) deps.session() && void syncNow("interval")
          else scheduleInterval()
        },
        pending > 0
          ? (deps.intervalMs?.pending ?? INTERVAL_PENDING_MS)
          : (deps.intervalMs?.idle ?? INTERVAL_MS)
      )
    })
  }

  return {
    async start() {
      if (started) return
      started = true
      await resetInflightOps(deps.db)
      void syncNow("boot")
    },
    stop() {
      started = false
      for (const t of [syncTimer, pushTimer, intervalTimer])
        if (t) clearTimeout(t)
      syncTimer = pushTimer = intervalTimer = null
    },
    requestSync(reason, opts = {}) {
      if (
        reason === "visible" &&
        !opts.force &&
        now() - lastSuccessAt < VISIBLE_THROTTLE_MS
      )
        return
      if (syncTimer) clearTimeout(syncTimer)
      syncTimer = setTimeout(() => {
        syncTimer = null
        void syncNow(reason, opts)
      }, deps.debounceMs?.sync ?? 250)
    },
    requestPush(reason) {
      if (pushTimer) clearTimeout(pushTimer)
      pushTimer = setTimeout(() => {
        pushTimer = null
        void syncNow(reason, { pushOnly: true })
      }, deps.debounceMs?.push ?? 1000)
    },
    syncNow,
    ingestMany: (raws) => ingest(raws),
    setVisible(v) {
      visible = v
    },
    status,
  }
}
