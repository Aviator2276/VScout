// What a match page says beyond the roster (matches.md M2, ADR-078): a predicted score from the game's
// prediction stat, the robots worth watching, and the TBA score breakdown. Pure and game-agnostic.
import { readPath } from "@/games/kit/external"
import { t } from "@/games/kit/labels"
import type { GameDefinition } from "@/games/types"
import type { TeamMetrics } from "./event-team-metrics"

type ByTeam = ReadonlyMap<number, TeamMetrics> | undefined

/** Sum of the prediction stat per alliance, rounded; null unless every robot has a value. */
export function predictScore(
  game: GameDefinition,
  byTeam: ByTeam,
  red: ReadonlyArray<number>,
  blue: ReadonlyArray<number>
): { red: number; blue: number } | null {
  const key = game.detailPage?.prediction?.external
  if (!key || !byTeam || red.length === 0 || blue.length === 0) return null
  const sum = (teams: ReadonlyArray<number>) => {
    let total = 0
    for (const team of teams) {
      const v = byTeam.get(team)?.external[key]
      if (typeof v !== "number") return null
      total += v
    }
    return Math.round(total)
  }
  const r = sum(red)
  const b = sum(blue)
  return r === null || b === null ? null : { red: r, blue: b }
}

/** Below this, a robot's reliability is worth a line under Watch For. */
export const RELIABILITY_WATCH = 0.8
/** Fewer scouted matches than this is "little data". */
export const LITTLE_DATA = 2

/** Up to 3 short lines; empty when there's nothing to say. */
export function watchFor(
  byTeam: ByTeam,
  teams: ReadonlyArray<number>
): Array<string> {
  if (!byTeam) return []
  const lines: Array<string> = []
  const little: Array<number> = []
  for (const team of teams) {
    const m = byTeam.get(team)
    if (!m) continue
    const cell = m.metrics.reliability
    if (
      cell &&
      !("error" in cell) &&
      typeof cell.value === "number" &&
      cell.value < RELIABILITY_WATCH
    )
      lines.push(
        `${team}: reliability ${Math.round(cell.value * 100)}% over ${cell.sampleSize} ${cell.sampleSize === 1 ? "match" : "matches"}`
      )
    if (m.coveredMatches < LITTLE_DATA) little.push(team)
  }
  if (little.length > 0) lines.push(`Little data on ${little.join(", ")}`)
  return lines.slice(0, 3)
}

export interface BreakdownRow {
  key: string
  label: string
  red: string
  blue: string
}

/** The game's alliance breakdown rows that TBA sent; empty without a breakdown. */
export function breakdownRows(
  game: GameDefinition,
  breakdown: { red?: unknown; blue?: unknown } | null | undefined
): Array<BreakdownRow> {
  if (!breakdown) return []
  return Object.entries(game.scoringKeys.tba.alliance).flatMap(
    ([key, path]) => {
      const r = readPath(breakdown.red, path)
      const b = readPath(breakdown.blue, path)
      if (typeof r !== "number" && typeof b !== "number") return []
      return [
        {
          key,
          label: t(game, `breakdown.${key}`),
          red: typeof r === "number" ? String(r) : "—",
          blue: typeof b === "number" ? String(b) : "—",
        },
      ]
    }
  )
}
