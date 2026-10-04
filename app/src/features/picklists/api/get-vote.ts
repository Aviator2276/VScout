// The picklist vote for one purpose (scout-tab.md A.2, ADR-080), read live: every person's ballot (the
// list they marked as their vote; the newest if a race left two), do-not-pick flags per team (how
// many people list it on any of their DNP lists), the ranked-choice result, the master list, and my
// own lists to vote with.
import { useDataRuntime, useViewer } from "@/lib/db/react/data-runtime"
import { useLiveOr } from "@/lib/db/react/data-state-hooks"
import { masterOf } from "@/lib/db/followed-picklist"
import type { PicklistEntryRecord } from "@/lib/db/types"
import { rankedChoice } from "../utils/ranked-choice"
import type { VoteRow } from "../utils/ranked-choice"
import type { PicklistRow } from "./get-picklists"

export type VotePurpose = "first" | "second"

export interface VoteBallot {
  userId: string
  voter: string
  listId: string
  listName: string
  teams: ReadonlyArray<number>
}

export interface VoteData {
  ballots: ReadonlyArray<VoteBallot>
  rows: ReadonlyArray<VoteRow>
  nicknames: ReadonlyMap<number, string>
  master: {
    id: string
    name: string
    rows: ReadonlyArray<PicklistRow>
  } | null
  /** my lists for this purpose, to vote with */
  mine: ReadonlyArray<{ id: string; name: string; teamCount: number }>
  /** the list I voted with, if any */
  myBallot: string | null
}

const byRank = (a: PicklistEntryRecord, b: PicklistEntryRecord) =>
  a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0

export function useVote(
  eventKey: string,
  purpose: VotePurpose
): VoteData | null {
  const { db } = useDataRuntime()
  const userId = useViewer()?.userId ?? null
  return useLiveOr<VoteData | null>(
    async () => {
      const [lists, entries] = await Promise.all([
        db.picklists.where("eventKey").equals(eventKey).toArray(),
        db.picklistEntries.where("eventKey").equals(eventKey).toArray(),
      ])
      const users = await db.users.bulkGet([
        ...new Set(lists.map((l) => l.ownerId)),
      ])
      const names = new Map(
        users.flatMap((u) => (u ? [[u.id, u.displayName] as const] : []))
      )
      const entriesOf = new Map<string, Array<PicklistEntryRecord>>()
      for (const e of entries) {
        const list = entriesOf.get(e.picklistId) ?? []
        list.push(e)
        entriesOf.set(e.picklistId, list)
      }
      const ordered = (id: string) => (entriesOf.get(id) ?? []).sort(byRank)

      // one ballot per person: their newest list marked as their vote
      const newest = new Map<string, (typeof lists)[number]>()
      for (const l of lists) {
        if (!l.ballot || l.master || l.purpose !== purpose) continue
        const cur = newest.get(l.ownerId)
        if (!cur || l.localUpdatedAt > cur.localUpdatedAt)
          newest.set(l.ownerId, l)
      }
      const ballots: Array<VoteBallot> = [...newest.values()]
        .map((l) => ({
          userId: l.ownerId,
          voter:
            l.ownerId === userId ? "You" : (names.get(l.ownerId) ?? "Someone"),
          listId: l.id,
          listName: l.name,
          teams: ordered(l.id).map((e) => e.teamNumber),
        }))
        .sort((a, b) => a.voter.localeCompare(b.voter))

      // do-not-pick: people, not lists, so two DNP lists by one person count once
      const dnpBy = new Map<number, Set<string>>()
      for (const l of lists) {
        if (l.purpose !== "dnp") continue
        for (const e of entriesOf.get(l.id) ?? []) {
          const who = dnpBy.get(e.teamNumber) ?? new Set<string>()
          who.add(l.ownerId)
          dnpBy.set(e.teamNumber, who)
        }
      }
      const dnp = new Map([...dnpBy].map(([t, s]) => [t, s.size]))

      const m = masterOf(lists, purpose)
      const masterEntries = m ? ordered(m.id) : []
      const teams = await db.teams.bulkGet([
        ...new Set(entries.map((e) => e.teamNumber)),
      ])
      const nicknames = new Map(
        teams.flatMap((t) => (t ? [[t.teamNumber, t.nickname] as const] : []))
      )
      const mine = lists
        .filter(
          (l) => l.ownerId === userId && l.purpose === purpose && !l.master
        )
        .sort((a, b) => b.localUpdatedAt - a.localUpdatedAt)
      return {
        ballots,
        rows: rankedChoice(
          ballots.map((b) => ({ voter: b.userId, teams: b.teams })),
          dnp
        ),
        nicknames,
        master: m
          ? {
              id: m.id,
              name: m.name,
              rows: masterEntries.map((e) => ({
                id: e.id,
                teamNumber: e.teamNumber,
                nickname: nicknames.get(e.teamNumber) ?? `Team ${e.teamNumber}`,
                rank: e.rank,
                reason: e.reason ?? "",
                syncState: e.syncState,
              })),
            }
          : null,
        mine: mine.map((l) => ({
          id: l.id,
          name: l.name,
          teamCount: entriesOf.get(l.id)?.length ?? 0,
        })),
        myBallot: (userId && newest.get(userId)?.id) || null,
      }
    },
    [eventKey, purpose, userId],
    null
  )
}
