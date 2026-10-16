// The Blue Alliance API v3 → event, team, match, eventTeam (REQUIREMENTS §11). Score breakdowns
// are stored exactly as received; unknown values are kept raw, never mapped to defaults.
import { iso } from "../lib/clock.js"
import type { CachedFetcher, FetchResult } from "./http-cache.js"

export const TBA_BASE = "https://www.thebluealliance.com/api/v3"

export interface TbaEvent {
  key: string
  name: string
  short_name?: string | null
  year: number
  event_type: number
  event_type_string?: string | null
  start_date: string
  end_date: string
  timezone?: string | null
  city?: string | null
  state_prov?: string | null
  country?: string | null
  week?: number | null
  website?: string | null
}

export interface TbaTeam {
  key: string
  team_number: number
  nickname?: string | null
  name?: string | null
  city?: string | null
  state_prov?: string | null
  country?: string | null
  rookie_year?: number | null
}

export interface TbaAlliance {
  team_keys: string[]
  surrogate_team_keys?: string[] | null
  dq_team_keys?: string[] | null
  score?: number | null
}

export interface TbaMatch {
  key: string
  comp_level: string
  set_number: number
  match_number: number
  event_key: string
  alliances: { red: TbaAlliance; blue: TbaAlliance }
  winning_alliance?: string | null
  time?: number | null
  actual_time?: number | null
  predicted_time?: number | null
  post_result_time?: number | null
  score_breakdown?: Record<string, unknown> | null
  videos?: Array<{ type: string; key: string }> | null
}

export interface TbaRankings {
  rankings: Array<{
    team_key: string
    rank: number
    record?: { wins: number; losses: number; ties: number } | null
    sort_orders?: number[] | null
    extra_stats?: number[] | null
    matches_played?: number | null
    dq?: number | null
    qual_average?: number | null
  }> | null
  sort_order_info?: Array<{ name: string; precision: number }> | null
  extra_stats_info?: Array<{ name: string; precision: number }> | null
}

const EVENT_TYPES: Record<number, string> = {
  0: "regional",
  1: "district",
  2: "dcmp",
  3: "cmp",
  4: "cmp",
  5: "dcmp",
  6: "offseason",
  99: "offseason",
  100: "offseason",
}

export const teamNumberFromKey = (key: string): number | null => {
  const m = /^frc(\d+)$/.exec(key)
  return m ? Number(m[1]) : null
}

const nums = (keys: string[] | null | undefined) =>
  (keys ?? []).map(teamNumberFromKey).filter((n): n is number => n !== null)

const secIso = (s: number | null | undefined) => (typeof s === "number" && s > 0 ? iso(s * 1000) : null)

export function mapEvent(e: TbaEvent, gameIdsByYear: Record<string, string>, activeGameId: string): Record<string, unknown> {
  const type = EVENT_TYPES[e.event_type]
  return {
    id: e.key,
    name: e.name,
    shortName: e.short_name ?? null,
    year: e.year,
    gameId: gameIdsByYear[String(e.year)] ?? activeGameId,
    ...(type ? { eventType: type } : {}),
    tbaEventType: e.event_type,
    eventTypeString: e.event_type_string ?? null,
    startDate: e.start_date,
    endDate: e.end_date,
    timezone: e.timezone || "UTC",
    location: [e.city, e.state_prov, e.country].filter(Boolean).join(", ") || null,
    week: e.week ?? null,
    website: e.website ?? null,
  }
}

export function mapTeam(t: TbaTeam): Record<string, unknown> {
  return {
    id: String(t.team_number),
    teamNumber: t.team_number,
    nickname: t.nickname ?? t.name ?? `Team ${t.team_number}`,
    city: [t.city, t.state_prov, t.country].filter(Boolean).join(", ") || null,
    rookieYear: t.rookie_year ?? null,
  }
}

const COMP_LEVELS = new Set(["qm", "ef", "qf", "sf", "f"])

/** TBA's part of a match record; Nexus adds its live fields on top (see importer). */
export function mapMatch(m: TbaMatch): Record<string, unknown> | null {
  if (!COMP_LEVELS.has(m.comp_level)) return null
  const alliance = (a: TbaAlliance) => ({
    teamNumbers: nums(a.team_keys).slice(0, 4),
    score: typeof a.score === "number" && a.score >= 0 ? a.score : null,
    surrogates: nums(a.surrogate_team_keys),
    dqs: nums(a.dq_team_keys),
  })
  const red = alliance(m.alliances.red)
  const blue = alliance(m.alliances.blue)
  const played = typeof m.post_result_time === "number" && m.post_result_time > 0 ? true : red.score !== null && blue.score !== null
  return {
    id: m.key,
    eventKey: m.event_key,
    compLevel: m.comp_level,
    setNumber: m.set_number,
    matchNumber: m.match_number,
    scheduledTime: secIso(m.time),
    tbaPredictedTime: secIso(m.predicted_time),
    actualTime: secIso(m.actual_time),
    postResultTime: secIso(m.post_result_time),
    alliances: { red, blue },
    played,
    winningAlliance: m.winning_alliance === "red" || m.winning_alliance === "blue" ? m.winning_alliance : null,
    scoreBreakdown: m.score_breakdown ?? null,
    videoKeys: (m.videos ?? []).map((v) => `${v.type}:${v.key}`),
  }
}

export interface RankingPart {
  rank: number
  record: { wins: number; losses: number; ties: number } | null
  rankingPoints: number | null
  ranking: Record<string, unknown>
}

export function mapRankings(r: TbaRankings): Map<number, RankingPart> {
  const out = new Map<number, RankingPart>()
  const sortNames = (r.sort_order_info ?? []).map((s) => s.name)
  const extraNames = (r.extra_stats_info ?? []).map((s) => s.name)
  for (const row of r.rankings ?? []) {
    const team = teamNumberFromKey(row.team_key)
    if (team === null) continue
    const named = (names: string[], values: number[] | null | undefined) =>
      Object.fromEntries((values ?? []).map((v, i) => [names[i] ?? `#${i}`, v]))
    out.set(team, {
      rank: row.rank,
      record: row.record ?? null,
      rankingPoints: typeof row.sort_orders?.[0] === "number" ? row.sort_orders[0] : null,
      ranking: {
        sortOrders: named(sortNames, row.sort_orders),
        extraStats: named(extraNames, row.extra_stats),
        matchesPlayed: row.matches_played ?? null,
        dq: row.dq ?? null,
        qualAverage: row.qual_average ?? null,
      },
    })
  }
  return out
}

export class TbaClient {
  constructor(
    private http: CachedFetcher,
    private apiKey: string,
    private base = TBA_BASE
  ) {}

  private get<T>(path: string): Promise<FetchResult<T>> {
    return this.http.getJson<T>("TBA", `${this.base}${path}`, { "X-TBA-Auth-Key": this.apiKey })
  }

  event(key: string) {
    return this.get<TbaEvent>(`/event/${key}`)
  }
  teams(key: string) {
    return this.get<TbaTeam[]>(`/event/${key}/teams`)
  }
  matches(key: string) {
    return this.get<TbaMatch[]>(`/event/${key}/matches`)
  }
  rankings(key: string) {
    return this.get<TbaRankings | null>(`/event/${key}/rankings`)
  }
}
