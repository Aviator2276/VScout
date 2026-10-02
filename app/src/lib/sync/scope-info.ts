// In-memory mirror of syncCursors (data-layer §9.2.1): hooks read it with useSyncExternalStore
// instead of querying syncCursors inside every live query (which would re-run them all on every page).
import type { VScoutDB } from "@/lib/db/schema"
import type { SyncCursorRow } from "@/lib/db/types"

export interface ScopeInfo {
  bootstrapState: "none" | "running" | "done"
  lastPulledAt: number
  forbidden: boolean
}

export const UNKNOWN_SCOPE: ScopeInfo = {
  bootstrapState: "none",
  lastPulledAt: 0,
  forbidden: false,
}

export interface ScopeInfoStore {
  get: (scope: string, entity: string) => ScopeInfo
  subscribe: (listener: () => void) => () => void
  /** reload every row from Dexie (boot, after each pull) */
  refresh: () => Promise<void>
  /** a version number that changes with every update (useSyncExternalStore snapshot) */
  version: () => number
}

export function createScopeInfoStore(db: () => VScoutDB): ScopeInfoStore {
  let rows = new Map<string, ScopeInfo>()
  let version = 0
  const listeners = new Set<() => void>()
  const key = (scope: string, entity: string) => `${scope}|${entity}`
  return {
    get: (scope, entity) => rows.get(key(scope, entity)) ?? UNKNOWN_SCOPE,
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    async refresh() {
      const all: Array<SyncCursorRow> = await db().syncCursors.toArray()
      rows = new Map(
        all.map((r) => [
          key(r.scope, r.entity),
          {
            bootstrapState: r.bootstrapState,
            lastPulledAt: r.lastPulledAt,
            forbidden: r.forbidden === true,
          },
        ])
      )
      version++
      for (const l of listeners) l()
    },
    version: () => version,
  }
}
