// Search, filter and sort for the team list (teams.md T1). Pure functions over the team rows and
// the precomputed metrics, so typing or re-sorting never recomputes metrics.
import type { GameDefinition } from "@/games/types"
import type { TeamMetrics } from "@/lib/metrics/event-team-metrics"
import { fold, nameMatches } from "@/utils/text-search"
import type { TeamsSearch } from "../types/teams-search"

export interface TeamRow {
  teamNumber: number
  nickname: string
  city: string | null
  rank: number | null
}

// ---------- search ----------

export interface ParsedTeamQuery {
  numbers: Array<string>
  words: Array<string>
  us: boolean
  noTeamNumber: boolean
  empty: boolean
}

const US = new Set(["us", "me", "our", "ours"])

export function parseTeamQuery(
  q: string | undefined,
  ourTeam: number | null
): ParsedTeamQuery {
  const out: ParsedTeamQuery = {
    numbers: [],
    words: [],
    us: false,
    noTeamNumber: false,
    empty: true,
  }
  for (const t of (q ?? "")
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean)) {
    if (/^\d{1,5}$/.test(t)) out.numbers.push(t)
    else if (US.has(t)) {
      if (ourTeam === null) out.noTeamNumber = true
      else out.us = true
    } else if (t.length >= 2) out.words.push(fold(t))
  }
  out.empty = out.numbers.length === 0 && out.words.length === 0 && !out.us
  return out
}

/** 0 = no match; higher = better (exact number 3, number prefix 2, name 1). Terms are ORed. */
export function matchQuality(
  t: TeamRow,
  q: ParsedTeamQuery,
  ourTeam: number | null
): number {
  if (q.empty) return 1
  let best = 0
  const n = String(t.teamNumber)
  for (const num of q.numbers) {
    if (n === num) best = Math.max(best, 3)
    else if (n.startsWith(num)) best = Math.max(best, 2)
  }
  if (q.us && t.teamNumber === ourTeam) best = Math.max(best, 3)
  for (const w of q.words)
    if (nameMatches(t.nickname, [w]) || nameMatches(t.city ?? "", [w]))
      best = Math.max(best, 1)
  return best
}

// ---------- filters ----------

export interface TeamFilterContext {
  watched: ReadonlySet<number>
  /** covered-matches target: recommender segments × targetPerSegment (ADR-031) */
  coverageTarget: number
}

export function passesFilters(
  t: TeamRow,
  m: TeamMetrics | undefined,
  s: TeamsSearch,
  ctx: TeamFilterContext
): boolean {
  if (s.watched && !ctx.watched.has(t.teamNumber)) return false
  if (s.ranked === "top8" && !(t.rank !== null && t.rank <= 8)) return false
  if (s.ranked === "top16" && !(t.rank !== null && t.rank <= 16)) return false
  if (s.pit !== "any" && (m?.pit ?? "none") !== s.pit) return false
  if (
    s.coverage === "under-target" &&
    (m?.coveredMatches ?? 0) >= ctx.coverageTarget
  )
    return false
  const drive = m?.drivetrain ?? "unknown"
  if (s.drivetrain?.length && !s.drivetrain.some((d) => d === drive))
    return false
  if (s.cap?.length) {
    for (const id of s.cap) {
      const c = m?.capabilities[id]
      const ok =
        s.capSource === "claimed"
          ? c?.claimed
          : s.capSource === "observed"
            ? c?.observed
            : c?.claimed || c?.observed
      if (!ok) return false
    }
  }
  return true
}

// ---------- sort ----------

export type SortValue = number | string | null

/** The value a team sorts by for `key`, or null (nulls always sort last). */
export function sortValue(
  game: GameDefinition,
  key: string,
  t: TeamRow,
  m: TeamMetrics | undefined
): SortValue {
  switch (key) {
    case "rank":
      return t.rank
    case "number":
      return t.teamNumber
    case "name":
      return t.nickname
    case "pit":
      return { none: 0, partial: 1, full: 2 }[m?.pit ?? "none"]
    case "scouted":
      return m?.coveredMatches ?? 0
  }
  if (game.metrics.some((d) => d.id === key)) {
    const cell = m?.metrics[key]
    if (!cell || "error" in cell) return null
    return cell.value
  }
  return m?.external[key] ?? null
}

/** Natural direction: rank/number/name/pit/scouted ascending, metrics by higherIsBetter, external desc. */
export function naturalDirection(
  game: GameDefinition,
  key: string
): "asc" | "desc" {
  const metric = game.metrics.find((d) => d.id === key)
  if (metric) return metric.higherIsBetter ? "desc" : "asc"
  if (key in game.scoringKeys.statbotics.teamEvent) return "desc"
  return "asc"
}

const collator = new Intl.Collator(undefined, { sensitivity: "base" })

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === "string" && typeof b === "string")
    return collator.compare(a, b)
  return Number(a) - Number(b)
}

export interface SortedTeams {
  ranked: Array<TeamRow>
  /** rank sort only: teams without a rank, by number */
  unranked: Array<TeamRow>
}

export function sortTeams(
  game: GameDefinition,
  teams: ReadonlyArray<TeamRow>,
  metrics: ReadonlyMap<number, TeamMetrics>,
  key: string,
  dir: "asc" | "desc" | undefined,
  quality?: (t: TeamRow) => number
): SortedTeams {
  const direction = dir ?? naturalDirection(game, key)
  const sign = direction === "asc" ? 1 : -1
  const value = new Map(
    teams.map((t) => [
      t.teamNumber,
      sortValue(game, key, t, metrics.get(t.teamNumber)),
    ])
  )
  const tieBreak = (a: TeamRow, b: TeamRow) =>
    (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.teamNumber - b.teamNumber
  const cmp = (a: TeamRow, b: TeamRow) => {
    const q = quality ? quality(b) - quality(a) : 0
    if (q !== 0) return q
    const x = value.get(a.teamNumber) ?? null
    const y = value.get(b.teamNumber) ?? null
    if (x === null && y === null) return tieBreak(a, b)
    if (x === null) return 1
    if (y === null) return -1
    return sign * compareValues(x, y) || tieBreak(a, b)
  }
  if (key === "rank" && !quality) {
    return {
      ranked: teams.filter((t) => t.rank !== null).sort(cmp),
      unranked: teams
        .filter((t) => t.rank === null)
        .sort((a, b) => a.teamNumber - b.teamNumber),
    }
  }
  return { ranked: [...teams].sort(cmp), unranked: [] }
}
