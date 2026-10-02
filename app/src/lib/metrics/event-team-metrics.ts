// Per-team derived data for one event (ADR-020, teams.md T1): the game's metrics, capabilities
// (claimed by pit, observed in matches), external stats, pit status and scouting coverage. Pure and
// game-agnostic: the game module supplies every rule; this only assembles MetricInput.
import { consolidate } from "@/games/kit/consolidate"
import { perRobotValue, readPath } from "@/games/kit/external"
import type {
  AllianceRankView,
  GameDefinition,
  MatchFacts,
  MetricResult,
  PitEntryView,
  ScoutEntryView,
} from "@/games/types"
import type {
  AllianceRankRecord,
  EventTeamRecord,
  MatchRecord,
  PitScoutingRecord,
  PostScoutingRecord,
  ScoutEntryRecord,
} from "@/lib/db/types"

export type MetricWindow = "all" | "recent"

export type MetricCell = MetricResult | { error: true }

export interface CapabilityState {
  /** the pit entry says so */
  claimed: boolean
  /** a scouted match confirms it */
  observed: boolean
}

export type PitStatus = "none" | "partial" | "full"

export interface TeamMetrics {
  teamNumber: number
  metrics: Readonly<Record<string, MetricCell>>
  capabilities: Readonly<Record<string, CapabilityState>>
  /** values of `display: 'value'` capabilities (claimed, else observed) */
  capabilityValues: Readonly<Record<string, string | number | null>>
  external: Readonly<Record<string, number | null>>
  pit: PitStatus
  /** played matches with at least one scout entry */
  coveredMatches: number
  drivetrain: string
}

export interface EventData {
  teams: ReadonlyArray<number>
  matches: ReadonlyArray<MatchRecord>
  entries: ReadonlyArray<ScoutEntryRecord>
  pit: ReadonlyArray<PitScoutingRecord>
  post: ReadonlyArray<PostScoutingRecord>
  allianceRanks: ReadonlyArray<AllianceRankRecord>
  eventTeams: ReadonlyArray<EventTeamRecord>
  weights: Readonly<Record<string, number>>
}

const LEVEL = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 } as const

function playOrder(a: MatchRecord, b: MatchRecord): number {
  return (
    LEVEL[a.compLevel] - LEVEL[b.compLevel] ||
    a.setNumber - b.setNumber ||
    a.matchNumber - b.matchNumber
  )
}

function isPlayed(m: MatchRecord): boolean {
  return (
    m.status === "played" ||
    (typeof m.alliances.red.score === "number" &&
      typeof m.alliances.blue.score === "number")
  )
}

function groupBy<TItem, TKey>(
  items: ReadonlyArray<TItem>,
  key: (item: TItem) => TKey
): Map<TKey, Array<TItem>> {
  const out = new Map<TKey, Array<TItem>>()
  for (const it of items) {
    const k = key(it)
    const list = out.get(k)
    if (list) list.push(it)
    else out.set(k, [it])
  }
  return out
}

const NEGATIVE = new Set(["", "none", "no", "false", "unknown"])

/** A pit answer that claims the capability: true, or any choice other than none/no. */
function truthy(v: unknown): boolean {
  return v === true || (typeof v === "string" && !NEGATIVE.has(v))
}

/** Statbotics values arrive keyed by the game's generic keys, or as the raw object with paths. */
function externalStats(
  game: GameDefinition,
  et: EventTeamRecord | undefined
): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const [key, path] of Object.entries(
    game.scoringKeys.statbotics.teamEvent
  )) {
    const direct = et?.stats[key]
    const value =
      typeof direct === "number" ? direct : readPath(et?.stats, path)
    out[key] =
      typeof value === "number" && Number.isFinite(value) ? value : null
  }
  return out
}

function matchFacts(
  game: GameDefinition,
  team: number,
  matches: ReadonlyArray<MatchRecord>
): Array<MatchFacts> {
  return matches.flatMap((m, order) => {
    const alliance = m.alliances.red.teamNumbers.includes(team)
      ? "red"
      : m.alliances.blue.teamNumbers.includes(team)
        ? "blue"
        : null
    if (!alliance) return []
    const index = m.alliances[alliance].teamNumbers.indexOf(team)
    const station = (index + 1) as 1 | 2 | 3
    const breakdown = m.scoreBreakdown?.[alliance]
    const tbaPerRobot: Record<string, string | null> = {}
    for (const key of Object.keys(game.scoringKeys.tba.perRobot))
      tbaPerRobot[key] =
        perRobotValue(game.scoringKeys, key, breakdown, station)?.value ?? null
    return [
      {
        matchKey: m.key,
        order,
        compLevel: m.compLevel,
        alliance,
        station,
        tbaPerRobot,
      },
    ]
  })
}

function capabilityFor(
  game: GameDefinition,
  pit: PitEntryView | null,
  entries: ReadonlyArray<ScoutEntryView>
): {
  states: Record<string, CapabilityState>
  values: Record<string, string | number | null>
} {
  const states: Record<string, CapabilityState> = {}
  const values: Record<string, string | number | null> = {}
  for (const cap of game.capabilities) {
    const raw =
      "pitField" in cap.source
        ? pit?.data[cap.source.pitField]
        : pit?.robot[cap.source.robotProfile]
    let observed = false
    let observedValue: number | null = null
    const by = cap.confirmedBy
    if (by)
      for (const e of entries) {
        const v = e.data[by.matchField]
        const list = Array.isArray(v) ? v : [v]
        if (by.rule === "anyEquals")
          observed ||= list.some((x) =>
            by.mapping ? by.mapping[String(x)] === "true" : truthy(x)
          )
        else
          for (const x of list) {
            const n =
              typeof x === "number" ? x : Number(by.mapping?.[String(x)])
            if (
              Number.isFinite(n) &&
              (observedValue === null || n > observedValue)
            ) {
              observedValue = n
              observed = true
            }
          }
      }
    states[cap.id] = { claimed: truthy(raw), observed }
    if (cap.display === "value")
      values[cap.id] =
        typeof raw === "string" || typeof raw === "number" ? raw : observedValue
  }
  return { states, values }
}

export function computeEventTeamMetrics(
  game: GameDefinition,
  data: EventData,
  window: MetricWindow
): Map<number, TeamMetrics> {
  const form = game.matchForm
  const played = [...data.matches].filter(isPlayed).sort(playOrder)
  const playedKeys = new Set(played.map((m) => m.key))
  const entriesByTeam = groupBy(
    data.entries.filter((e) => !e.unsupported),
    (e) => e.teamNumber
  )
  const pitByTeam = groupBy(data.pit, (p) => p.teamNumber)
  const postByTeam = groupBy(data.post, (p) => p.teamNumber)
  const eventTeam = new Map(data.eventTeams.map((t) => [t.teamNumber, t]))
  const ranksByMatch = groupBy(data.allianceRanks, (r) => r.matchKey)

  const out = new Map<number, TeamMetrics>()
  for (const team of data.teams) {
    const facts = matchFacts(game, team, played)
    const byMatch = groupBy(entriesByTeam.get(team) ?? [], (e) => e.matchKey)
    // in play order; matches without entries contribute nothing
    const views: Array<ScoutEntryView> = facts.flatMap((f) => {
      const list = byMatch.get(f.matchKey)
      return list ? [consolidate(form, f.matchKey, list)] : []
    })
    const latestPit = [...(pitByTeam.get(team) ?? [])].sort(
      (a, b) => b.updatedAt - a.updatedAt
    )[0]
    const pit: PitEntryView | null = latestPit
      ? { data: latestPit.data, robot: latestPit.robot }
      : null
    const allianceRanks: Array<AllianceRankView> = facts.flatMap((f) =>
      (ranksByMatch.get(f.matchKey) ?? [])
        .filter((r) => r.alliance === f.alliance)
        .map((r) => ({
          matchKey: f.matchKey,
          position: Object.fromEntries(
            Object.entries(r.ranks).map(([criterion, order]) => [
              criterion,
              order.indexOf(team) + 1,
            ])
          ),
        }))
    )
    const external = externalStats(game, eventTeam.get(team))
    const input = {
      teamNumber: team,
      window: window === "recent" ? ("last4" as const) : ("all" as const),
      matches: facts,
      entries: views,
      allianceRanks,
      pit,
      post: (postByTeam.get(team) ?? []).map((p) => ({ data: p.data })),
      external,
      weights: data.weights,
    }
    const metrics: Record<string, MetricCell> = {}
    for (const def of game.metrics) {
      try {
        metrics[def.id] = def.compute(input)
      } catch {
        metrics[def.id] = { error: true }
      }
    }
    const caps = capabilityFor(
      game,
      pit,
      window === "recent" ? views.slice(-4) : views
    )
    const coveredMatches = [...byMatch.keys()].filter((k) =>
      playedKeys.has(k)
    ).length
    out.set(team, {
      teamNumber: team,
      metrics,
      capabilities: caps.states,
      capabilityValues: caps.values,
      external,
      pit: latestPit
        ? latestPit.photos.length > 0
          ? "full"
          : "partial"
        : "none",
      coveredMatches,
      drivetrain: latestPit?.robot.drivetrain ?? "unknown",
    })
  }
  return out
}
