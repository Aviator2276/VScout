// Matches reads (matches.md "Data"). Components get DataState from here and never touch Dexie.
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import {
  useCollectionState,
  useLiveOr,
  useRecordState,
} from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import type { MatchRecord } from "@/lib/db/types"
import { coverageByMatch } from "../utils/match-view"
import type { Coverage } from "../utils/match-view"

const scope = (eventKey: string) => ({
  scope: `event:${eventKey}`,
  entity: "match",
})

export function useEventMatches(
  eventKey: string
): DataState<ReadonlyArray<MatchRecord>> {
  const { db } = useDataRuntime()
  return useCollectionState({
    enabled: true,
    source: scope(eventKey),
    query: () => db.matches.where("eventKey").equals(eventKey).toArray(),
    deps: [eventKey],
  })
}

export function useMatch(matchKey: string): DataState<MatchRecord> {
  const { db } = useDataRuntime()
  const eventKey = matchKey.split("_")[0] ?? ""
  return useRecordState({
    enabled: true,
    source: scope(eventKey),
    query: () => db.matches.get(matchKey),
    deps: [matchKey],
  })
}

const EMPTY_COVERAGE = new Map<string, Coverage>()

/** Entries per station per match. Coverage is decoration: a failed read shows no dots, not an error. */
export function useMatchCoverage(
  eventKey: string
): ReadonlyMap<string, Coverage> {
  const { db } = useDataRuntime()
  return useLiveOr(
    async () => {
      const entries = await db.scoutEntries
        .where("eventKey")
        .equals(eventKey)
        .toArray()
      return coverageByMatch(
        entries.map((e) => ({
          matchKey: e.matchKey,
          station: e.station,
        }))
      )
    },
    [eventKey],
    EMPTY_COVERAGE
  )
}

export interface MatchListContext {
  nicknames: ReadonlyMap<number, string>
  videos: ReadonlySet<string>
  timeZone: string
}

const NO_CONTEXT: MatchListContext = {
  nicknames: new Map(),
  videos: new Set(),
  timeZone: "UTC",
}

/** Team nicknames (search), downloaded videos (filter) and the event's time zone (day sections). */
export function useMatchListContext(eventKey: string): MatchListContext {
  const { db } = useDataRuntime()
  return useLiveOr(
    async () => {
      const [event, eventTeams, videos] = await Promise.all([
        db.events.get(eventKey),
        db.eventTeams.where("eventKey").equals(eventKey).toArray(),
        db.mediaVideos.where("eventKey").equals(eventKey).toArray(),
      ])
      const teams = await db.teams.bulkGet(eventTeams.map((t) => t.teamNumber))
      return {
        nicknames: new Map(
          teams.flatMap((t) => (t ? [[t.teamNumber, t.nickname] as const] : []))
        ),
        videos: new Set(
          videos
            .filter((v) => v.downloadState === "done")
            .map((v) => String(v.matchKey))
        ),
        timeZone: event?.timezone ?? "UTC",
      }
    },
    [eventKey],
    NO_CONTEXT
  )
}

export interface MatchTeamInfo {
  teamNumber: number
  nickname: string | null
  rank: number | null
}

/** Nickname and rank for a match's teams (alliance cards). */
export function useMatchTeams(
  eventKey: string,
  teams: ReadonlyArray<number>
): ReadonlyMap<number, MatchTeamInfo> {
  const { db } = useDataRuntime()
  const key = teams.join(",")
  return useLiveOr(
    async () => {
      const [infos, eventTeams] = await Promise.all([
        db.teams.bulkGet([...teams]),
        db.eventTeams
          .where("[eventKey+teamNumber]")
          .anyOf(teams.map((t) => [eventKey, t]))
          .toArray(),
      ])
      const rank = new Map(eventTeams.map((t) => [t.teamNumber, t.rank]))
      return new Map(
        teams.map((t, i) => [
          t,
          {
            teamNumber: t,
            nickname: infos[i]?.nickname ?? null,
            rank: rank.get(t) ?? null,
          },
        ])
      )
    },
    [eventKey, key],
    new Map()
  )
}
