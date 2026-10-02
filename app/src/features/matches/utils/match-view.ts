// A match record joined with what the list shows: labels, best-known time, played state, coverage.
// Pure: the hooks build these from Dexie rows (matches.md "Virtualization and performance").
import type { MatchRecord } from "@/lib/db/types"
import { longMatchLabel, shortMatchLabel } from "@/utils/match-label"

/** Entry counts per station, in field order red1…blue3. */
export type Coverage = readonly [number, number, number, number, number, number]
export const NO_COVERAGE: Coverage = [0, 0, 0, 0, 0, 0]

export const STATIONS = [
  "red1",
  "red2",
  "red3",
  "blue1",
  "blue2",
  "blue3",
] as const
export type Station = (typeof STATIONS)[number]

export interface MatchView {
  key: string
  compLevel: MatchRecord["compLevel"]
  setNumber: number
  matchNumber: number
  label: string
  longLabel: string
  /** actual if played, a fresh live estimate, else the schedule (ms) */
  time: number | null
  /** the time is a live estimate (Nexus) */
  predicted: boolean
  red: ReadonlyArray<number>
  blue: ReadonlyArray<number>
  redScore: number | null
  blueScore: number | null
  winner: "red" | "blue" | null
  played: boolean
  onField: boolean
  status: MatchRecord["status"]
  coverage: Coverage
}

/** A live estimate older than this is ignored (ADR-072: only trusted while fresh). */
export const PREDICTION_FRESH_MS = 15 * 60_000

export function isPlayed(m: MatchRecord): boolean {
  return (
    m.status === "played" ||
    (typeof m.alliances.red.score === "number" &&
      typeof m.alliances.blue.score === "number")
  )
}

export function toMatchView(
  m: MatchRecord,
  coverage: Coverage,
  now: number
): MatchView {
  const played = isPlayed(m)
  const fresh =
    m.predictedTime !== null &&
    m.predictedAt !== null &&
    now - m.predictedAt < PREDICTION_FRESH_MS
  const time = played
    ? (m.actualTime ?? m.scheduledTime)
    : fresh
      ? m.predictedTime
      : m.scheduledTime
  return {
    key: m.key,
    compLevel: m.compLevel,
    setNumber: m.setNumber,
    matchNumber: m.matchNumber,
    label: shortMatchLabel(m),
    longLabel: longMatchLabel(m),
    time,
    predicted: !played && fresh,
    red: m.alliances.red.teamNumbers,
    blue: m.alliances.blue.teamNumbers,
    redScore: m.alliances.red.score ?? null,
    blueScore: m.alliances.blue.score ?? null,
    winner: m.winningAlliance,
    played,
    onField: m.status === "onField",
    status: m.status,
    coverage,
  }
}

/** Groups entries by match into per-station counts (< 10 ms for 1,000 entries). */
export function coverageByMatch(
  entries: ReadonlyArray<{ matchKey: string; station: Station }>
): Map<string, Coverage> {
  const out = new Map<string, Array<number>>()
  for (const e of entries) {
    let row = out.get(e.matchKey)
    if (!row) {
      row = [0, 0, 0, 0, 0, 0]
      out.set(e.matchKey, row)
    }
    const i = STATIONS.indexOf(e.station)
    if (i >= 0) row[i] = (row[i] ?? 0) + 1
  }
  return out as unknown as Map<string, Coverage>
}

export type ScoutedLevel = "none" | "partial" | "full"

/** Unscouted robots and the coverage level the `scouted` filter uses (matches.md "Filters"). */
export function scoutedState(c: Coverage): {
  zero: number
  one: number
  full: boolean
  partial: boolean
} {
  const zero = c.filter((n) => n === 0).length
  return {
    zero,
    one: c.filter((n) => n === 1).length,
    full: zero === 0,
    partial: zero > 0 && zero < 6,
  }
}
