// Chat (scout-tab.md D, ADR-034): the event channel and one-to-one DMs. Guests never get here
// (route guard, ADR-066). Sends are ordinary outbox writes; unread counts use a per-channel read
// cursor kept on this device (ADR-033).
import { useCallback } from "react"
import { dmChannelId } from "@/lib/contracts/message"
import { getKv, setKv } from "@/lib/db/kv"
import {
  useDataRuntime,
  useViewer,
  useWriter,
} from "@/lib/db/react/data-runtime"
import { useCollectionState, useLiveOr } from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import type { MessageRecord, SyncState } from "@/lib/db/types"
import { createRecord, deleteRecord, updateRecord } from "@/lib/sync/mutate"
import { groupReactions } from "./get-announcements"
import type { ReactionCount } from "./get-announcements"

export function eventChannel(eventKey: string): string {
  return `event:${eventKey}`
}

/** The other participant of a DM channel, or null when I'm not in it. */
export function dmPeer(channelId: string, me: string): string | null {
  const m = /^dm:([^:]+):([^:]+)$/.exec(channelId)
  if (!m) return null
  if (m[1] === me) return m[2] ?? null
  if (m[2] === me) return m[1] ?? null
  return null
}

export interface Conversation {
  channelId: string
  title: string
  lastText: string | null
  lastAt: number | null
  unread: number
  pinned: boolean
}

async function cursor(
  db: ReturnType<typeof useDataRuntime>["db"],
  channelId: string
) {
  return (await getKv(db, `readCursor:${channelId}`)) ?? 0
}

export function useConversations(
  eventKey: string
): DataState<ReadonlyArray<Conversation>> {
  const { db } = useDataRuntime()
  const me = useViewer()?.userId ?? ""
  return useCollectionState({
    enabled: me !== "",
    source: [
      { scope: `event:${eventKey}`, entity: "message" },
      { scope: "user", entity: "message" },
    ],
    deps: [eventKey, me],
    share: (c) => `${c.channelId}:${c.lastAt}:${c.unread}`,
    query: async () => {
      const all = (await db.messages.toArray()).filter(
        (m) => m.kind === "message"
      )
      const byChannel = new Map<string, Array<MessageRecord>>()
      for (const m of all) {
        if (m.channelId !== eventChannel(eventKey) && !dmPeer(m.channelId, me))
          continue
        const list = byChannel.get(m.channelId)
        if (list) list.push(m)
        else byChannel.set(m.channelId, [m])
      }
      const peers = [...byChannel.keys()].flatMap((c) => {
        const p = dmPeer(c, me)
        return p ? [p] : []
      })
      const users = await db.users.bulkGet(peers)
      const names = new Map(
        users.flatMap((u) => (u ? [[u.id, u.displayName] as const] : []))
      )
      const event = eventChannel(eventKey)
      if (!byChannel.has(event)) byChannel.set(event, [])
      const out: Array<Conversation> = []
      for (const [channelId, list] of byChannel) {
        const last = [...list].sort((a, b) => b.createdAt - a.createdAt)[0]
        const seen = await cursor(db, channelId)
        const peer = dmPeer(channelId, me)
        out.push({
          channelId,
          title:
            channelId === event
              ? `#${eventKey} · Everyone`
              : (names.get(peer ?? "") ?? "Someone"),
          lastText: last?.body ?? null,
          lastAt: last?.createdAt ?? null,
          unread: list.filter((m) => m.createdAt > seen && m.authorId !== me)
            .length,
          pinned: channelId === event,
        })
      }
      return out.sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          (b.lastAt ?? 0) - (a.lastAt ?? 0)
      )
    },
  })
}

export interface ChatMessage {
  id: string
  body: string
  authorId: string
  authorName: string
  mine: boolean
  createdAt: number
  syncState: SyncState
  reactions: ReadonlyArray<ReactionCount>
}

export function useThread(
  channelId: string
): DataState<ReadonlyArray<ChatMessage>> {
  const { db } = useDataRuntime()
  const me = useViewer()?.userId ?? ""
  const isEvent = channelId.startsWith("event:")
  const allowed = isEvent || dmPeer(channelId, me) !== null
  return useCollectionState({
    enabled: me !== "",
    allowed,
    source: isEvent
      ? { scope: channelId, entity: "message" }
      : { scope: "user", entity: "message" },
    deps: [channelId, me],
    share: (m) =>
      `${m.id}:${m.syncState}:${m.reactions.map((r) => `${r.emoji}${r.count}${r.mineId ?? ""}`).join()}`,
    query: async () => {
      const rows = (
        await db.messages
          .where("[channelId+createdAt]")
          .between([channelId, -Infinity], [channelId, Infinity])
          .toArray()
      ).filter((m) => m.kind === "message")
      const reactions = await db.reactions
        .where("targetId")
        .anyOf(rows.map((r) => r.id))
        .toArray()
      const users = await db.users.bulkGet([
        ...new Set([
          ...rows.map((r) => r.authorId),
          ...reactions.map((r) => r.authorId),
        ]),
      ])
      const names = new Map(
        users.flatMap((u) => (u ? [[u.id, u.displayName] as const] : []))
      )
      return rows.map((m) => ({
        id: m.id,
        body: m.body,
        authorId: m.authorId,
        authorName:
          m.authorId === me ? "You" : (names.get(m.authorId) ?? "Someone"),
        mine: m.authorId === me,
        createdAt: m.createdAt,
        syncState: m.syncState,
        reactions: groupReactions(
          reactions.filter((r) => r.targetId === m.id),
          me,
          names
        ),
      }))
    },
  })
}

export function useMarkRead(channelId: string) {
  const { db } = useDataRuntime()
  return useCallback(
    async (upTo: number) => {
      if ((await cursor(db, channelId)) < upTo)
        await setKv(db, `readCursor:${channelId}`, upTo)
    },
    [db, channelId]
  )
}

export function useChatWrites(eventKey: string, channelId: string) {
  const writer = useWriter()
  const send = useCallback(
    (body: string) =>
      createRecord(writer, "message", {
        eventKey,
        channelId,
        kind: "message",
        body: body.trim(),
        priority: "normal",
      }),
    [writer, eventKey, channelId]
  )
  /** "Not sent. Tap to retry.": re-queue the rejected or stuck message as it is */
  const retry = useCallback(
    (id: string) => updateRecord(writer, "message", id, (cur) => cur),
    [writer]
  )
  const remove = useCallback(
    (id: string) => deleteRecord(writer, "message", id),
    [writer]
  )
  const react = useCallback(
    async (
      targetId: string,
      emoji: ReactionCount["emoji"],
      mineId: string | null
    ) => {
      if (mineId) await deleteRecord(writer, "reaction", mineId)
      else
        await createRecord(writer, "reaction", {
          eventKey,
          targetType: "message",
          targetId,
          emoji,
        })
    },
    [writer, eventKey]
  )
  return { send, retry, remove, react }
}

export interface Person {
  id: string
  name: string
}

/** The people I can message: not guests, not me (D1 new DM sheet). */
export function usePeople(): ReadonlyArray<Person> {
  const { db } = useDataRuntime()
  const me = useViewer()?.userId ?? ""
  return useLiveOr(
    async () =>
      (await db.users.toArray())
        .filter((u) => u.id !== me && u.role !== "guest")
        .map((u) => ({ id: u.id, name: u.displayName }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [me],
    []
  )
}

export function useDmChannel(): (peerId: string) => string {
  const me = useViewer()?.userId ?? ""
  return useCallback((peerId) => dmChannelId(me, peerId), [me])
}
