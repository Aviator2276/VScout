// Pre-match strategy (scout-tab.md C): which match to brief (ours next, or any), and for one match
// every robot with its scouting, opponents first then partners.
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import {
  useCollectionState,
  useRecordState,
} from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import type { MatchRecord, ScoutEntryRecord } from "@/lib/db/types"

export type Side = "us" | "partner" | "opponent" | "red" | "blue"

export interface BriefingTeam {
  teamNumber: number
  nickname: string
  rank: number | null
  alliance: "red" | "blue"
  side: Side
  entries: ReadonlyArray<Pick<ScoutEntryRecord, "data" | "tags" | "createdAt">>
}

export interface Briefing {
  match: MatchRecord
  ourAlliance: "red" | "blue" | null
  teams: ReadonlyArray<BriefingTeam>
}

const ORDER: Record<Side, number> = {
  opponent: 0,
  partner: 1,
  us: 2,
  red: 0,
  blue: 1,
}

export function useBriefing(
  eventKey: string,
  matchKey: string,
  ourTeam: number | null
): DataState<Briefing> {
  const { db } = useDataRuntime()
  return useRecordState({
    enabled: matchKey.startsWith(`${eventKey}_`),
    source: { scope: `event:${eventKey}`, entity: "match" },
    deps: [eventKey, matchKey, ourTeam],
    query: async () => {
      const match = await db.matches.get(matchKey)
      if (!match) return undefined
      const ours: "red" | "blue" | null =
        ourTeam === null
          ? null
          : match.alliances.red.teamNumbers.includes(ourTeam)
            ? "red"
            : match.alliances.blue.teamNumbers.includes(ourTeam)
              ? "blue"
              : null
      const all = [
        ...match.alliances.red.teamNumbers.map((t) => ({
          t,
          a: "red" as const,
        })),
        ...match.alliances.blue.teamNumbers.map((t) => ({
          t,
          a: "blue" as const,
        })),
      ]
      const [teams, ranks, entries] = await Promise.all([
        db.teams.bulkGet(all.map((x) => x.t)),
        db.eventTeams
          .where("[eventKey+teamNumber]")
          .anyOf(all.map((x) => [eventKey, x.t]))
          .toArray(),
        db.scoutEntries
          .where("[eventKey+teamNumber]")
          .anyOf(all.map((x) => [eventKey, x.t]))
          .toArray(),
      ])
      const rank = new Map(ranks.map((r) => [r.teamNumber, r.rank]))
      const list = all.map(({ t, a }, i): BriefingTeam => ({
        teamNumber: t,
        nickname: teams[i]?.nickname ?? `Team ${t}`,
        rank: rank.get(t) ?? null,
        alliance: a,
        side:
          ours === null
            ? a
            : t === ourTeam
              ? "us"
              : a === ours
                ? "partner"
                : "opponent",
        entries: entries.filter((e) => e.teamNumber === t && !e.unsupported),
      }))
      list.sort((x, y) => ORDER[x.side] - ORDER[y.side])
      return { match, ourAlliance: ours, teams: list }
    },
  })
}

/** Upcoming matches, ours first when we have a team number (C1). */
export function useStrategyMatches(
  eventKey: string
): DataState<ReadonlyArray<MatchRecord>> {
  const { db } = useDataRuntime()
  return useCollectionState({
    enabled: true,
    source: { scope: `event:${eventKey}`, entity: "match" },
    deps: [eventKey],
    query: async () =>
      (await db.matches.where("eventKey").equals(eventKey).toArray())
        .filter((m) => m.status !== "played")
        .sort(
          (a, b) =>
            (a.scheduledTime ?? Infinity) - (b.scheduledTime ?? Infinity)
        ),
  })
}
