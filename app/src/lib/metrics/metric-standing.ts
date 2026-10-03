// Where one team's metric stands at the event (teams.md T2 stat tiles, ADR-078): its rank among teams
// with a value, and how the last 4 matches compare with all of them. Pure and game-agnostic.
import type { MetricDef } from "@/games/types"
import type { MetricCell, TeamMetrics } from "./event-team-metrics"

export interface MetricRank {
  /** 1 = best; ties share a rank (0.9, 0.8, 0.8 → 1, 2, 2) */
  rank: number
  of: number
}

function numeric(cell: MetricCell | undefined): number | null {
  if (!cell || "error" in cell) return null
  return typeof cell.value === "number" ? cell.value : null
}

export function metricRank(
  byTeam: ReadonlyMap<number, TeamMetrics> | undefined,
  def: Pick<MetricDef, "id" | "higherIsBetter">,
  teamNumber: number
): MetricRank | null {
  if (!byTeam) return null
  const mine = numeric(byTeam.get(teamNumber)?.metrics[def.id])
  if (mine === null) return null
  let better = 0
  let of = 0
  for (const t of byTeam.values()) {
    const v = numeric(t.metrics[def.id])
    if (v === null) continue
    of++
    if (def.higherIsBetter ? v > mine : v < mine) better++
  }
  return { rank: better + 1, of }
}

const ORDINAL = new Intl.PluralRules("en", { type: "ordinal" })
const SUFFIX: Record<string, string> = {
  one: "st",
  two: "nd",
  few: "rd",
  other: "th",
}

/** "3rd of 36" */
export function formatRank({ rank, of }: MetricRank): string {
  return `${rank}${SUFFIX[ORDINAL.select(rank)] ?? "th"} of ${of}`
}

export interface MetricTrend {
  direction: "up" | "down"
  /** up on a higher-is-better metric, or down on a lower-is-better one */
  good: boolean
  /** "Up 0.6 in last 4", "Down 8% in last 4" */
  text: string
}

/** The last 4 matches against all matches; null when either is missing or they read the same. */
export function metricTrend(
  def: Pick<MetricDef, "format" | "higherIsBetter">,
  all: MetricCell | undefined,
  recent: MetricCell | undefined
): MetricTrend | null {
  const a = numeric(all)
  const r = numeric(recent)
  if (a === null || r === null) return null
  const diff = r - a
  const size =
    def.format === "percent"
      ? `${Math.round(Math.abs(diff) * 100)}%`
      : Math.abs(diff).toFixed(1)
  // the same number at display precision is "no change"
  if (size === "0%" || size === "0.0") return null
  const direction = diff > 0 ? "up" : "down"
  return {
    direction,
    good: direction === "up" ? def.higherIsBetter : !def.higherIsBetter,
    text: `${direction === "up" ? "Up" : "Down"} ${size} in last 4`,
  }
}
