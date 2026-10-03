// Notes (comments) on a team or a match, newest first, with author names (ADR-040). Private notes
// are the author's only, admins included: they're filtered here and the server never sends others'.
import type { DataState } from "@/lib/db/react/data-state"
import { useCallback } from "react"
import {
  useDataRuntime,
  useViewer,
  useWriter,
} from "@/lib/db/react/data-runtime"
import { useCollectionState } from "@/lib/db/react/data-state-hooks"
import type { CommentRecord } from "@/lib/db/types"
import { can } from "@/lib/authorization"
import { createRecord, deleteRecord } from "@/lib/sync/mutate"

export interface NoteView {
  id: string
  body: string
  authorId: string
  authorName: string
  createdAt: number
  private: boolean
  mine: boolean
  matchKey: string | null
  teamNumber: number
  syncState: CommentRecord["syncState"]
  record: CommentRecord
}

export type NotesTarget =
  | { eventKey: string; teamNumber: number }
  | { eventKey: string; matchKey: string }

export function useNotes(
  target: NotesTarget
): DataState<ReadonlyArray<NoteView>> {
  const { db } = useDataRuntime()
  const viewer = useViewer()
  const userId = viewer?.userId ?? null
  const key = "teamNumber" in target ? target.teamNumber : target.matchKey
  return useCollectionState({
    enabled: true,
    source: { scope: `event:${target.eventKey}`, entity: "comment" },
    deps: [target.eventKey, key, userId],
    share: (n) => `${n.id}:${n.record.rev}:${n.syncState}:${n.authorName}`,
    query: async () => {
      const rows =
        "teamNumber" in target
          ? await db.comments
              .where("[eventKey+teamNumber+createdAt]")
              .between(
                [target.eventKey, target.teamNumber, -Infinity],
                [target.eventKey, target.teamNumber, Infinity]
              )
              .toArray()
          : await db.comments
              .where("[eventKey+matchKey]")
              .equals([target.eventKey, target.matchKey])
              .toArray()
      const visible = rows.filter((c) => can(viewer, "comment:read", c))
      const users = await db.users.bulkGet([
        ...new Set(visible.map((c) => c.authorId)),
      ])
      const names = new Map(
        users.flatMap((u) => (u ? [[u.id, u.displayName] as const] : []))
      )
      return visible
        .map((c): NoteView => ({
          id: c.id,
          body: c.body,
          authorId: c.authorId,
          authorName:
            c.authorId === userId
              ? "You"
              : (names.get(c.authorId) ?? "Someone"),
          createdAt: c.createdAt,
          private: c.visibility === "private",
          mine: c.authorId === userId,
          matchKey: c.matchKey ?? null,
          teamNumber: c.teamNumber,
          syncState: c.syncState,
          record: c,
        }))
        .sort((a, b) => b.createdAt - a.createdAt)
    },
  })
}

/** Add a note (ADR-040): team-visible by default, or private (author only). */
export function useAddNote(eventKey: string) {
  const writer = useWriter()
  return useCallback(
    (note: {
      teamNumber: number
      matchKey?: string
      body: string
      private: boolean
    }) =>
      createRecord(writer, "comment", {
        eventKey,
        teamNumber: note.teamNumber,
        ...(note.matchKey ? { matchKey: note.matchKey } : {}),
        body: note.body.trim(),
        tags: [],
        visibility: note.private ? "private" : "team",
      }),
    [writer, eventKey]
  )
}

export function useDeleteNote() {
  const writer = useWriter()
  return useCallback(
    (id: string) => deleteRecord(writer, "comment", id),
    [writer]
  )
}
