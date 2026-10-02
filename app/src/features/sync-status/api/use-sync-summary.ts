// Live counts behind the sync pill (ui-patterns §7.1, data-layer §10): outbox and open conflicts,
// read from Dexie so every tab agrees, plus the engine phase.
import { useLiveQuery } from "dexie-react-hooks"
import { useSyncExternalStore } from "react"
import type { SyncSummaryInput } from "@/components/sync/sync-pill"
import { useOnline } from "@/hooks/use-online"
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import type { SyncStatus } from "@/lib/sync/status-store"

const IDLE: SyncStatus = { phase: "idle", leaderTab: false }
const noop = () => () => undefined

export function useSyncSummary(): SyncSummaryInput & {
  lastSuccessAt: number | undefined
} {
  const { db, syncStatus } = useDataRuntime()
  const online = useOnline()
  const status = useSyncExternalStore(
    syncStatus?.subscribe ?? noop,
    syncStatus?.getSnapshot ?? (() => IDLE),
    () => IDLE
  )
  const counts = useLiveQuery(
    async () => {
      const [pending, rejected, conflicts] = await Promise.all([
        db.outbox.where("state").anyOf("queued", "inflight").count(),
        db.outbox.where("state").equals("failed").count(),
        db.conflicts.where("status").equals("open").count(),
      ])
      return { pending, rejected, conflicts }
    },
    [db],
    { pending: 0, rejected: 0, conflicts: 0 }
  )
  return {
    online,
    syncing:
      status.phase === "pushing" ||
      status.phase === "pulling" ||
      status.phase === "bootstrapping",
    ...counts,
    lastSuccessAt: status.lastSuccessAt,
  }
}
