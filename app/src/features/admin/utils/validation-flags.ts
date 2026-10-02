// Validation flags (features/admin.md AD4 tab 2): a scouted value that disagrees with what TBA
// recorded for that robot, per the game module's validations and scoring keys. Game-agnostic.
import { perRobotValue } from "@/games/kit/external"
import type { ScoringKeys, ValidationDef } from "@/games/types"

export interface FlagEntry {
  id: string
  matchKey: string
  teamNumber: number
  /** "red1" … "blue3" */
  station: string
  authorId: string
  data: Readonly<Record<string, unknown>>
}

export interface FlagMatch {
  key: string
  scoreBreakdown?: Record<string, unknown> | null
}

export interface ValidationFlag {
  id: string
  entryId: string
  matchKey: string
  teamNumber: number
  validationId: string
  field: string
  scouted: string
  tba: string
  authorId: string
}

export function validationFlags(
  validations: ReadonlyArray<ValidationDef>,
  keys: ScoringKeys,
  matches: ReadonlyArray<FlagMatch>,
  entries: ReadonlyArray<FlagEntry>
): { flags: Array<ValidationFlag>; missingBreakdowns: number } {
  const byKey = new Map(matches.map((m) => [m.key, m]))
  const flags: Array<ValidationFlag> = []
  const missing = new Set<string>()
  for (const e of entries) {
    const m = byKey.get(e.matchKey)
    if (!m) continue
    const alliance = e.station.startsWith("red") ? "red" : "blue"
    const n = Number(e.station.slice(-1))
    if (n !== 1 && n !== 2 && n !== 3) continue
    const breakdown = m.scoreBreakdown?.[alliance]
    if (!breakdown) {
      missing.add(m.key)
      continue
    }
    for (const v of validations) {
      const scouted = e.data[v.matchField]
      if (scouted === undefined || scouted === null) continue
      const tba = perRobotValue(keys, v.tbaPerRobot, breakdown, n)
      // unknown TBA values are logged by the kit, never flagged as the scouter's mistake
      if (!tba?.known || tba.value === null) continue
      if (String(scouted) !== tba.value)
        flags.push({
          id: `${e.id}:${v.id}`,
          entryId: e.id,
          matchKey: e.matchKey,
          teamNumber: e.teamNumber,
          validationId: v.id,
          field: v.matchField,
          scouted: String(scouted),
          tba: tba.value,
          authorId: e.authorId,
        })
    }
  }
  return { flags, missingBreakdowns: missing.size }
}
