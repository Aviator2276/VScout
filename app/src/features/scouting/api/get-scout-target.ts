// What a scouting form is about: the match (match forms) and the team, plus whether scouting is
// open (scouting-forms.md S1–S3 data states).
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { useLiveOr, useRecordState } from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import type { MatchRecord } from "@/lib/db/types"

export function useScoutMatch(
  eventKey: string,
  matchKey: string
): DataState<MatchRecord> {
  const { db } = useDataRuntime()
  return useRecordState({
    enabled: matchKey.startsWith(`${eventKey}_`),
    source: { scope: `event:${eventKey}`, entity: "match" },
    query: () => db.matches.get(matchKey),
    deps: [matchKey],
  })
}

export interface ScoutTeam {
  teamNumber: number
  nickname: string
  /** played all its quals: post-scouting is open (S3) */
  qualsDone: boolean
}

export function useScoutTeam(
  eventKey: string,
  teamNumber: number
): DataState<ScoutTeam> {
  const { db } = useDataRuntime()
  return useRecordState({
    enabled: Number.isInteger(teamNumber) && teamNumber > 0,
    source: { scope: `event:${eventKey}`, entity: "eventTeam" },
    deps: [eventKey, teamNumber],
    query: async () => {
      const et = await db.eventTeams
        .where("[eventKey+teamNumber]")
        .equals([eventKey, teamNumber])
        .first()
      if (!et) return undefined
      const [team, matches] = await Promise.all([
        db.teams.get(teamNumber),
        db.matches.where("teamNumbers").equals(teamNumber).toArray(),
      ])
      const quals = matches.filter(
        (m) => m.eventKey === eventKey && m.compLevel === "qm"
      )
      return {
        teamNumber,
        nickname: team?.nickname ?? `Team ${teamNumber}`,
        qualsDone:
          quals.length > 0 && quals.every((m) => m.status === "played"),
      }
    },
  })
}

export interface ScoutingSettings {
  scoutingOpen: boolean
  postOpenEarly: boolean
}

export function useScoutingSettings(eventKey: string): ScoutingSettings {
  const { db } = useDataRuntime()
  return useLiveOr(
    async () => {
      const s = await db.eventSettings.get(eventKey)
      return {
        scoutingOpen: s?.scoutingOpen ?? true,
        postOpenEarly: s?.postScouting?.openEarly ?? false,
      }
    },
    [eventKey],
    { scoutingOpen: true, postOpenEarly: false }
  )
}
