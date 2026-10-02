// A DataRuntime for hook and component tests: a fresh db, a real scope-info store and a switchable
// canSync flag.
import type { ReactNode } from "react"
import { canWrite } from "@/lib/authorization"
import { DataRuntimeContext } from "@/lib/db/react/data-runtime"
import type { DataRuntime, Viewer } from "@/lib/db/react/data-runtime"
import type { SyncCursorRow } from "@/lib/db/types"
import { createScopeInfoStore } from "@/lib/sync/scope-info"
import { TEST_USER, createTestDb, testDeps } from "./db"

export function createTestRuntime(o: { viewer?: Viewer | null } = {}) {
  const db = createTestDb()
  let viewer: Viewer | null =
    o.viewer === undefined ? { userId: TEST_USER, role: "scouter" } : o.viewer
  const { deps: writer, clock } = testDeps(db, {
    session: () => viewer,
    authorize: (action, entity, record) =>
      canWrite(viewer, action, entity, record),
  })
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
    viewer: () => viewer,
    writer,
  }
  return {
    db,
    runtime,
    writer,
    clock,
    setViewer(next: Viewer | null) {
      viewer = next
      for (const l of listeners) l()
    },
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
