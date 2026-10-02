// Announcements (scout-tab.md D3): admin posts in the event channel, read by everyone including
// guests, with reactions (ADR-066/073). Urgent ones stay pinned until this device acknowledges them.
import { useCallback } from "react"
import { REACTION_EMOJI } from "@/lib/contracts/reaction"
import { getKv, setKv } from "@/lib/db/kv"
import {
  useDataRuntime,
  useViewer,
  useWriter,
} from "@/lib/db/react/data-runtime"
import { useCollectionState, useLiveOr } from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import type { ReactionRecord, SyncState } from "@/lib/db/types"
import { createRecord, deleteRecord } from "@/lib/sync/mutate"

export type Emoji = (typeof REACTION_EMOJI)[number]

export interface ReactionCount {
  emoji: Emoji
  count: number
  /** my reaction's id, to remove it */
  mineId: string | null
  /** display names, for "who reacted" */
  names: ReadonlyArray<string>
}

export interface AnnouncementView {
  id: string
  body: string
  authorName: string
  createdAt: number
  urgent: boolean
  syncState: SyncState
  reactions: ReadonlyArray<ReactionCount>
}

export function groupReactions(
  rows: ReadonlyArray<ReactionRecord>,
  userId: string | null,
  names: ReadonlyMap<string, string>
): Array<ReactionCount> {
  return REACTION_EMOJI.flatMap((emoji) => {
    const list = rows.filter((r) => r.emoji === emoji)
    if (list.length === 0) return []
    return [
      {
        emoji,
        count: list.length,
        mineId: list.find((r) => r.authorId === userId)?.id ?? null,
        names: list.map((r) =>
          r.authorId === userId ? "You" : (names.get(r.authorId) ?? "Someone")
        ),
      },
    ]
  })
}

export function useAnnouncements(
  eventKey: string
): DataState<ReadonlyArray<AnnouncementView>> {
  const { db } = useDataRuntime()
  const userId = useViewer()?.userId ?? null
  return useCollectionState({
    enabled: true,
    source: { scope: `event:${eventKey}`, entity: "message" },
    deps: [eventKey, userId],
    share: (a) =>
      `${a.id}:${a.syncState}:${a.reactions.map((r) => `${r.emoji}${r.count}${r.mineId ?? ""}`).join()}`,
    query: async () => {
      const rows = await db.messages
        .where("[eventKey+kind+createdAt]")
        .between(
          [eventKey, "announcement", -Infinity],
          [eventKey, "announcement", Infinity]
        )
        .toArray()
      const reactions = await db.reactions
        .where("targetId")
        .anyOf(rows.map((r) => r.id))
        .toArray()
      const people = await db.users.bulkGet([
        ...new Set([
          ...rows.map((r) => r.authorId),
          ...reactions.map((r) => r.authorId),
        ]),
      ])
      const names = new Map(
        people.flatMap((u) => (u ? [[u.id, u.displayName] as const] : []))
      )
      return rows
        .map((m): AnnouncementView => ({
          id: m.id,
          body: m.body,
          authorName: names.get(m.authorId) ?? "An admin",
          createdAt: m.createdAt,
          urgent: m.priority === "urgent",
          syncState: m.syncState,
          reactions: groupReactions(
            reactions.filter((r) => r.targetId === m.id),
            userId,
            names
          ),
        }))
        .sort((a, b) => b.createdAt - a.createdAt)
    },
  })
}

/** Ids of urgent announcements this device already acknowledged. */
export function useAckedAnnouncements(): {
  acked: ReadonlySet<string>
  acknowledge: (id: string) => Promise<void>
} {
  const { db } = useDataRuntime()
  const list = useLiveOr(
    async () => (await getKv(db, "ackedAnnouncements")) ?? [],
    [],
    [] as Array<string>
  )
  const acknowledge = useCallback(
    async (id: string) => {
      const current = (await getKv(db, "ackedAnnouncements")) ?? []
      // keep the list short: the last 200 acknowledgements
      await setKv(db, "ackedAnnouncements", [...current, id].slice(-200))
    },
    [db]
  )
  return { acked: new Set(list), acknowledge }
}

/** Tap an emoji to add your reaction, tap again to remove it (an outbox write, offline-safe). */
export function useToggleReaction(eventKey: string) {
  const writer = useWriter()
  return useCallback(
    async (targetId: string, emoji: Emoji, mineId: string | null) => {
      if (mineId) await deleteRecord(writer, "reaction", mineId)
      else
        await createRecord(writer, "reaction", {
          eventKey,
          targetType: "announcement",
          targetId,
          emoji,
        })
    },
    [writer, eventKey]
  )
}

/** Admins post and remove announcements (features/admin.md AD8); push fan-out is the server's. */
export function useAnnouncementWrites(eventKey: string) {
  const writer = useWriter()
  const post = useCallback(
    (body: string, urgent: boolean) =>
      createRecord(writer, "message", {
        eventKey,
        channelId: `event:${eventKey}`,
        kind: "announcement",
        body: body.trim(),
        priority: urgent ? "urgent" : "normal",
      }),
    [writer, eventKey]
  )
  const remove = useCallback(
    (id: string) => deleteRecord(writer, "message", id),
    [writer]
  )
  return { post, remove }
}
