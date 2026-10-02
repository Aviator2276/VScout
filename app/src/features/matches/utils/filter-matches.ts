// Search + filters over match views (matches.md M1). Pure; a keystroke filters ~100 rows in < 2 ms.
import { nameMatches } from "@/utils/text-search"
import type { MatchesSearch } from "../types/matches-search"
import type { MatchView } from "./match-view"
import { scoutedState } from "./match-view"
import type { ParsedMatchQuery } from "./parse-match-query"
import { refMatches } from "./parse-match-query"

export interface FilterContext {
  ourTeam: number | null
  watched: ReadonlySet<number>
  nicknames: ReadonlyMap<number, string>
  /** match keys with a downloaded video */
  videos: ReadonlySet<string>
}

function teamsOf(m: MatchView): Array<number> {
  return [...m.red, ...m.blue]
}

export function matchesQuery(
  m: MatchView,
  q: ParsedMatchQuery,
  ctx: FilterContext
): boolean {
  if (q.empty) return true
  const teams = teamsOf(m)
  if (q.matches.length > 0 && !q.matches.some((r) => refMatches(r, m)))
    return false
  if (!q.teams.every((t) => teams.includes(t))) return false
  if (
    q.teamOrQual !== null &&
    !teams.includes(q.teamOrQual) &&
    !(m.compLevel === "qm" && m.matchNumber === q.teamOrQual)
  )
    return false
  if (q.us && (ctx.ourTeam === null || !teams.includes(ctx.ourTeam)))
    return false
  if (
    q.words.length > 0 &&
    !teams.some((t) => nameMatches(ctx.nicknames.get(t) ?? "", q.words))
  )
    return false
  return true
}

export function matchesFilters(
  m: MatchView,
  s: MatchesSearch,
  ctx: FilterContext
): boolean {
  const teams = teamsOf(m)
  if (s.ours && (ctx.ourTeam === null || !teams.includes(ctx.ourTeam)))
    return false
  if (s.watched && !teams.some((t) => ctx.watched.has(t))) return false
  if (s.status === "upcoming" && m.played) return false
  if (s.status === "played" && !m.played) return false
  if (s.level === "qm" && m.compLevel !== "qm") return false
  if (s.level === "playoff" && m.compLevel === "qm") return false
  if (s.team !== undefined && !teams.includes(s.team)) return false
  if (s.video && !ctx.videos.has(m.key)) return false
  if (s.scouted !== "any") {
    const c = scoutedState(m.coverage)
    if (s.scouted === "none" && c.zero === 0) return false
    if (s.scouted === "partial" && !c.partial) return false
    if (s.scouted === "full" && !c.full) return false
  }
  return true
}

export function filterMatches(
  matches: ReadonlyArray<MatchView>,
  q: ParsedMatchQuery,
  s: MatchesSearch,
  ctx: FilterContext
): Array<MatchView> {
  return matches.filter(
    (m) => matchesQuery(m, q, ctx) && matchesFilters(m, s, ctx)
  )
}
