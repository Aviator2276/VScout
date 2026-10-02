// Personal sims (scout-tab.md B): what-if boards that live on this device only. A sim is the list
// of actions replayed over the current rankings, so undo is "drop the last action".
import { useCallback } from "react"
import {
  useDataRuntime,
  useViewer,
  useWriter,
} from "@/lib/db/react/data-runtime"
import { useLiveOr } from "@/lib/db/react/data-state-hooks"
import type { LocalAction } from "../utils/selection-rules"

export interface Sim {
  id: string
  eventKey: string
  ownerId: string
  name: string
  actions: Array<LocalAction>
  createdAt: number
}

function isSim(
  row: Record<string, unknown>
): row is Record<string, unknown> & Sim {
  return typeof row.id === "string" && Array.isArray(row.actions)
}

export function useSims(eventKey: string): ReadonlyArray<Sim> {
  const { db } = useDataRuntime()
  const userId = useViewer()?.userId ?? ""
  return useLiveOr(
    async () =>
      (
        await db.allianceSims
          .where("[eventKey+ownerId]")
          .equals([eventKey, userId])
          .toArray()
      )
        .filter(isSim)
        .sort((a, b) => b.createdAt - a.createdAt),
    [eventKey, userId],
    []
  )
}

export function useSimWrites(eventKey: string) {
  const writer = useWriter()
  const userId = useViewer()?.userId ?? ""
  const create = useCallback(
    async (name: string, actions: Array<LocalAction> = []) => {
      const sim: Sim = {
        id: writer.ids.newId(),
        eventKey,
        ownerId: userId,
        name,
        actions,
        createdAt: writer.clock.now(),
      }
      await writer.db.allianceSims.put({ ...sim })
      return sim
    },
    [writer, eventKey, userId]
  )
  const setActions = useCallback(
    (id: string, actions: Array<LocalAction>) =>
      writer.db.allianceSims.update(id, { actions }),
    [writer]
  )
  const remove = useCallback(
    (id: string) => writer.db.allianceSims.delete(id),
    [writer]
  )
  return { create, setActions, remove }
}
