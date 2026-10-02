// Picklists (scout-tab.md A, ADR-004/025/042): everyone reads every list with its owner's name;
// only the owner edits. The admin-followed list (eventSettings.followedPicklistId) is pinned.
import { useCallback } from "react"
import {
  useDataRuntime,
  useViewer,
  useWriter,
} from "@/lib/db/react/data-runtime"
import {
  useCollectionState,
  useLiveOr,
  useRecordState,
} from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import type { PicklistEntryRecord, PicklistRecord } from "@/lib/db/types"
import { createRecord, deleteRecord, updateRecord } from "@/lib/sync/mutate"
import { keyBetween, keysAfter } from "../utils/ranks"

export type Purpose = PicklistRecord["purpose"]

export interface PicklistSummary {
  id: string
  name: string
  purpose: Purpose
  ownerId: string
  ownerName: string
  mine: boolean
  followed: boolean
  teamCount: number
  updatedAt: number
  syncState: PicklistRecord["syncState"]
}

const scope = (eventKey: string) => ({
  scope: `event:${eventKey}`,
  entity: "picklist",
})

async function names(
  db: ReturnType<typeof useDataRuntime>["db"],
  ids: ReadonlyArray<string>
): Promise<Map<string, string>> {
  const users = await db.users.bulkGet([...new Set(ids)])
  return new Map(
    users.flatMap((u) => (u ? [[u.id, u.displayName] as const] : []))
  )
}

export function usePicklists(
  eventKey: string
): DataState<ReadonlyArray<PicklistSummary>> {
  const { db } = useDataRuntime()
  const userId = useViewer()?.userId ?? null
  return useCollectionState({
    enabled: true,
    source: scope(eventKey),
    deps: [eventKey, userId],
    share: (p) =>
      `${p.id}:${p.updatedAt}:${p.teamCount}:${p.followed}:${p.syncState}`,
    query: async () => {
      const [lists, entries, settings] = await Promise.all([
        db.picklists.where("eventKey").equals(eventKey).toArray(),
        db.picklistEntries.where("eventKey").equals(eventKey).toArray(),
        db.eventSettings.get(eventKey),
      ])
      const who = await names(
        db,
        lists.map((l) => l.ownerId)
      )
      const counts = new Map<string, number>()
      for (const e of entries)
        counts.set(e.picklistId, (counts.get(e.picklistId) ?? 0) + 1)
      const followedId = settings?.followedPicklistId ?? null
      return lists
        .map((l): PicklistSummary => ({
          id: l.id,
          name: l.name,
          purpose: l.purpose,
          ownerId: l.ownerId,
          ownerName:
            l.ownerId === userId ? "You" : (who.get(l.ownerId) ?? "Someone"),
          mine: l.ownerId === userId,
          followed: l.id === followedId,
          teamCount: counts.get(l.id) ?? 0,
          updatedAt: l.localUpdatedAt,
          syncState: l.syncState,
        }))
        .sort(
          (a, b) =>
            Number(b.followed) - Number(a.followed) || b.updatedAt - a.updatedAt
        )
    },
  })
}

export interface PicklistRow {
  id: string
  teamNumber: number
  nickname: string
  rank: string
  reason: string
  syncState: PicklistEntryRecord["syncState"]
}

export interface PicklistDetail {
  list: PicklistRecord
  ownerName: string
  mine: boolean
  followed: boolean
  rows: ReadonlyArray<PicklistRow>
}

export function usePicklist(
  eventKey: string,
  id: string
): DataState<PicklistDetail> {
  const { db } = useDataRuntime()
  const userId = useViewer()?.userId ?? null
  return useRecordState({
    enabled: true,
    source: scope(eventKey),
    id,
    deps: [eventKey, id, userId],
    query: async () => {
      const list = await db.picklists.get(id)
      if (!list) return undefined
      const [entries, settings, who] = await Promise.all([
        db.picklistEntries
          .where("[picklistId+rank]")
          .between([id, ""], [id, "￿"])
          .toArray(),
        db.eventSettings.get(eventKey),
        names(db, [list.ownerId]),
      ])
      const teams = await db.teams.bulkGet(entries.map((e) => e.teamNumber))
      return {
        list,
        ownerName:
          list.ownerId === userId
            ? "You"
            : (who.get(list.ownerId) ?? "Someone"),
        mine: list.ownerId === userId,
        followed: settings?.followedPicklistId === id,
        rows: entries.map((e, i) => ({
          id: e.id,
          teamNumber: e.teamNumber,
          nickname: teams[i]?.nickname ?? `Team ${e.teamNumber}`,
          rank: e.rank,
          reason: e.reason ?? "",
          syncState: e.syncState,
        })),
      }
    },
  })
}

/** Teams at this event (the Add Teams sheet). */
export function useEventTeamNames(
  eventKey: string
): ReadonlyArray<{ teamNumber: number; nickname: string }> {
  const { db } = useDataRuntime()
  return useLiveOr(
    async () => {
      const et = await db.eventTeams
        .where("eventKey")
        .equals(eventKey)
        .toArray()
      const teams = await db.teams.bulkGet(et.map((t) => t.teamNumber))
      return et
        .map((t, i) => ({
          teamNumber: t.teamNumber,
          nickname: teams[i]?.nickname ?? "",
        }))
        .sort((a, b) => a.teamNumber - b.teamNumber)
    },
    [eventKey],
    []
  )
}

/** All the writes the editor makes; each is an ordinary outbox write (offline OK). */
export function usePicklistWrites(eventKey: string) {
  const writer = useWriter()
  const userId = useViewer()?.userId ?? ""

  const create = useCallback(
    (input: {
      name: string
      purpose: Purpose
      teams?: ReadonlyArray<number>
      reasons?: ReadonlyMap<number, string>
    }) =>
      (async () => {
        const list = await createRecord(writer, "picklist", {
          eventKey,
          ownerId: userId,
          name: input.name.trim(),
          purpose: input.purpose,
        })
        const teams = input.teams ?? []
        const keys = keysAfter(null, teams.length)
        for (const [i, team] of teams.entries()) {
          const reason = input.reasons?.get(team)
          await createRecord(writer, "picklistEntry", {
            eventKey,
            picklistId: list.id,
            teamNumber: team,
            rank: keys[i] ?? String(i),
            ...(reason ? { reason } : {}),
          })
        }
        return list
      })(),
    [writer, eventKey, userId]
  )

  const addTeams = useCallback(
    async (
      picklistId: string,
      lastRank: string | null,
      teams: ReadonlyArray<number>
    ) => {
      const keys = keysAfter(lastRank, teams.length)
      for (const [i, team] of teams.entries())
        await createRecord(writer, "picklistEntry", {
          eventKey,
          picklistId,
          teamNumber: team,
          rank: keys[i] ?? String(i),
        })
    },
    [writer, eventKey]
  )

  const move = useCallback(
    (entryId: string, before: string | null, after: string | null) =>
      updateRecord(writer, "picklistEntry", entryId, (cur) => ({
        ...cur,
        rank: keyBetween(before, after),
      })),
    [writer]
  )

  const setReason = useCallback(
    (entryId: string, reason: string) =>
      updateRecord(writer, "picklistEntry", entryId, (cur) => {
        const { reason: _old, ...rest } = cur
        return reason.trim() ? { ...rest, reason: reason.trim() } : rest
      }),
    [writer]
  )

  /** Remove, returning an undo that puts the same team back at the same place (ADR-029). */
  const remove = useCallback(
    async (row: PicklistRow, picklistId: string) => {
      await deleteRecord(writer, "picklistEntry", row.id)
      return () =>
        createRecord(writer, "picklistEntry", {
          eventKey,
          picklistId,
          teamNumber: row.teamNumber,
          rank: row.rank,
          ...(row.reason ? { reason: row.reason } : {}),
        })
    },
    [writer, eventKey]
  )

  const deleteList = useCallback(
    async (detail: PicklistDetail) => {
      for (const r of detail.rows)
        await deleteRecord(writer, "picklistEntry", r.id)
      await deleteRecord(writer, "picklist", detail.list.id)
    },
    [writer]
  )

  return { create, addTeams, move, setReason, remove, deleteList }
}
