// My scouting for this event (scouting-forms.md S4): submitted entries of every kind, newest first,
// with their sync state; and deleting one of mine (tombstone + delete op, criterion 15).
import { useCallback } from "react"
import {
  useDataRuntime,
  useViewer,
  useWriter,
} from "@/lib/db/react/data-runtime"
import { useCollectionState } from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import type { SyncState } from "@/lib/db/types"
import { deleteRecord } from "@/lib/sync/mutate"

export type EntryKind = "match" | "pit" | "post"

export interface MyEntry {
  id: string
  kind: EntryKind
  matchKey: string | null
  teamNumber: number
  updatedAt: number
  syncState: SyncState
}

const ENTITY = {
  match: "scoutEntry",
  pit: "pitScouting",
  post: "postScouting",
} as const

export function useMyEntries(
  eventKey: string
): DataState<ReadonlyArray<MyEntry>> {
  const { db } = useDataRuntime()
  const userId = useViewer()?.userId ?? null
  return useCollectionState({
    enabled: userId !== null,
    source: [
      { scope: `event:${eventKey}`, entity: "scoutEntry" },
      { scope: `event:${eventKey}`, entity: "pitScouting" },
    ],
    deps: [eventKey, userId],
    share: (e) => `${e.id}:${e.syncState}:${e.updatedAt}`,
    query: async () => {
      const mine =
        (kind: EntryKind) =>
        (r: {
          id: string
          teamNumber: number
          matchKey?: string
          localUpdatedAt: number
          syncState: SyncState
        }): MyEntry => ({
          id: r.id,
          kind,
          matchKey: r.matchKey ?? null,
          teamNumber: r.teamNumber,
          updatedAt: r.localUpdatedAt,
          syncState: r.syncState,
        })
      const where = [eventKey, userId ?? ""]
      const [m, p, q] = await Promise.all([
        db.scoutEntries.where("[eventKey+authorId]").equals(where).toArray(),
        db.pitScouting.where("[eventKey+authorId]").equals(where).toArray(),
        db.postScouting.where("[eventKey+authorId]").equals(where).toArray(),
      ])
      return [
        ...m.map(mine("match")),
        ...p.map(mine("pit")),
        ...q.map(mine("post")),
      ].sort((a, b) => b.updatedAt - a.updatedAt)
    },
  })
}

export function useDeleteEntry(): (
  entry: Pick<MyEntry, "id" | "kind">
) => Promise<void> {
  const writer = useWriter()
  return useCallback(
    (entry) => deleteRecord(writer, ENTITY[entry.kind], entry.id),
    [writer]
  )
}

/** Throw away a draft (the user confirmed). */
export function useDiscardDraft(): (id: string) => Promise<void> {
  const { db } = useDataRuntime()
  return useCallback((id) => db.drafts.delete(id), [db])
}
