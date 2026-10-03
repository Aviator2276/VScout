// Teams reads (teams.md "Data"). The list reads eventTeams + teams; metrics come from the shared
// useEventTeamMetrics (hooks/), computed once per event and window (ADR-020).
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import {
  useCollectionState,
  useLiveOr,
  useRecordState,
} from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import type {
  MatchRecord,
  MediaAssetRecord,
  PitScoutingRecord,
  PostScoutingRecord,
} from "@/lib/db/types"
import type { TeamRow } from "../utils/team-list"

const scope = (eventKey: string, entity: string) => ({
  scope: `event:${eventKey}`,
  entity,
})

export function useEventTeams(
  eventKey: string
): DataState<ReadonlyArray<TeamRow>> {
  const { db } = useDataRuntime()
  return useCollectionState({
    enabled: true,
    source: scope(eventKey, "eventTeam"),
    deps: [eventKey],
    share: (t) => `${t.teamNumber}:${t.rank}:${t.nickname}:${t.city}`,
    query: async () => {
      const eventTeams = await db.eventTeams
        .where("eventKey")
        .equals(eventKey)
        .toArray()
      const teams = await db.teams.bulkGet(eventTeams.map((t) => t.teamNumber))
      return eventTeams.map((et, i) => ({
        teamNumber: et.teamNumber,
        nickname: teams[i]?.nickname ?? `Team ${et.teamNumber}`,
        city: teams[i]?.city ?? null,
        rank: et.rank,
      }))
    },
  })
}

export interface TeamDetail extends TeamRow {
  rookieYear: number | null
  record: { wins: number; losses: number; ties: number } | null
  rankingPoints: number | null
  pitLocation: string | null
}

export function useTeam(
  eventKey: string,
  teamNumber: number
): DataState<TeamDetail> {
  const { db } = useDataRuntime()
  return useRecordState({
    enabled: Number.isInteger(teamNumber) && teamNumber > 0,
    source: scope(eventKey, "eventTeam"),
    deps: [eventKey, teamNumber],
    query: async () => {
      const et = await db.eventTeams
        .where("[eventKey+teamNumber]")
        .equals([eventKey, teamNumber])
        .first()
      if (!et) return undefined
      const team = await db.teams.get(teamNumber)
      return {
        teamNumber,
        nickname: team?.nickname ?? `Team ${teamNumber}`,
        city: team?.city ?? null,
        rookieYear: team?.rookieYear ?? null,
        rank: et.rank,
        record: et.record ?? null,
        rankingPoints: et.rankingPoints,
        pitLocation: et.pitLocation,
      }
    },
  })
}

/** The team's matches at this event, in schedule order (Matches sub-view). */
export function useTeamMatches(
  eventKey: string,
  teamNumber: number
): DataState<ReadonlyArray<MatchRecord>> {
  const { db } = useDataRuntime()
  return useCollectionState({
    enabled: true,
    source: scope(eventKey, "match"),
    deps: [eventKey, teamNumber],
    query: async () =>
      (await db.matches.where("teamNumbers").equals(teamNumber).toArray())
        .filter((m) => m.eventKey === eventKey)
        .sort(
          (a, b) =>
            LEVEL[a.compLevel] - LEVEL[b.compLevel] ||
            a.setNumber - b.setNumber ||
            a.matchNumber - b.matchNumber
        ),
  })
}

const LEVEL = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 } as const

export interface TeamPit {
  entry: PitScoutingRecord
  photos: ReadonlyArray<MediaAssetRecord>
}

/** The latest pit entry and the team's robot photos (Pit sub-view). */
export function useTeamPit(
  eventKey: string,
  teamNumber: number
): DataState<TeamPit> {
  const { db } = useDataRuntime()
  return useRecordState({
    enabled: true,
    source: scope(eventKey, "pitScouting"),
    deps: [eventKey, teamNumber],
    query: async () => {
      const entries = await db.pitScouting
        .where("[eventKey+teamNumber]")
        .equals([eventKey, teamNumber])
        .toArray()
      const entry = entries.sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (!entry) return undefined
      const photos = await db.mediaAssets
        .where("[eventKey+teamNumber]")
        .equals([eventKey, teamNumber])
        .toArray()
      return { entry, photos }
    },
    explainMissing: async () => "not-scouted",
  })
}

/** The team's robot photos, newest first: the top of the team page (owner). */
export function useTeamPhotos(
  eventKey: string,
  teamNumber: number
): ReadonlyArray<MediaAssetRecord> {
  const { db } = useDataRuntime()
  return useLiveOr(
    async () =>
      (
        await db.mediaAssets
          .where("[eventKey+teamNumber]")
          .equals([eventKey, teamNumber])
          .toArray()
      ).sort((a, b) => b.createdAt - a.createdAt),
    [db, eventKey, teamNumber],
    []
  )
}

/** Post-match (post-scouting) entries for the team, newest first (BETA, scouting-forms.md). */
export function useTeamPost(
  eventKey: string,
  teamNumber: number
): DataState<ReadonlyArray<PostScoutingRecord>> {
  const { db } = useDataRuntime()
  return useCollectionState({
    enabled: true,
    source: scope(eventKey, "postScouting"),
    deps: [eventKey, teamNumber],
    query: async () =>
      (
        await db.postScouting
          .where("[eventKey+teamNumber]")
          .equals([eventKey, teamNumber])
          .toArray()
      ).sort((a, b) => b.createdAt - a.createdAt),
  })
}
