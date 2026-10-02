// A DataRuntime for hook and component tests: a fresh db, a real scope-info store and a switchable
// canSync flag.
import type { ReactNode } from "react"
import { DataRuntimeContext } from "@/lib/db/react/data-runtime"
import type { DataRuntime } from "@/lib/db/react/data-runtime"
import type { SyncCursorRow } from "@/lib/db/types"
import { createScopeInfoStore } from "@/lib/sync/scope-info"
import { createTestDb } from "./db"

export function createTestRuntime() {
  const db = createTestDb()
  const scopeInfo = createScopeInfoStore(() => db)
  let online = true
  const listeners = new Set<() => void>()
  const syncRequests: Array<true> = []
  const runtime: DataRuntime = {
    db,
    scopeInfo,
    canSync: () => online,
    subscribeSync: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    requestSync: () => syncRequests.push(true),
  }
  return {
    db,
    runtime,
    syncRequests,
    setOnline(next: boolean) {
      online = next
      for (const l of listeners) l()
    },
    async seedScope(
      scope: string,
      entity: string,
      row: Partial<SyncCursorRow> = {}
    ) {
      await db.syncCursors.put({
        scope,
        entity,
        cursor: "1",
        lastPulledAt: 0,
        bootstrapState: "done",
        ...row,
      })
      await scopeInfo.refresh()
    },
    wrapper: ({ children }: { children: ReactNode }) => (
      <DataRuntimeContext value={runtime}>{children}</DataRuntimeContext>
    ),
  }
}
