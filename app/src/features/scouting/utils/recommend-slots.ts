// "Needs scouting" (scout-tab.md S1, ADR-031): which robot in which match to scout next, so each
// team is seen early, in the middle and late in its qualification schedule. Pure: no React, Dexie
// or clock. It never decides who scouts; the hash spread keeps two scouters apart (ADR-072).
import type { RecommenderConfig } from "@/lib/contracts/event-settings"

export const STATION_ORDER = [
  "red1",
  "red2",
  "red3",
  "blue1",
  "blue2",
  "blue3",
] as const
export type Station = (typeof STATION_ORDER)[number]

export interface RecMatch {
  key: string
  compLevel: "qm" | "ef" | "qf" | "sf" | "f"
  setNumber: number
  matchNumber: number
  scheduledTime: number | null
  status: "scheduled" | "queuing" | "onField" | "played"
  red: ReadonlyArray<number>
  blue: ReadonlyArray<number>
}

export interface RecEntry {
  matchKey: string
  teamNumber: number
  authorId: string
}

export interface RecommendInput {
  matches: ReadonlyArray<RecMatch>
  /** live entries (not tombstoned), synced or pending */
  entries: ReadonlyArray<RecEntry>
  userId: string
  ourTeam: number | null
  watched: ReadonlySet<number>
  /** `${matchKey}|${teamNumber}` with a draft of mine: shown as Resume, not recommended */
  myDrafts?: ReadonlySet<string>
}

export type Reason =
  | { kind: "last-chance"; segment: string }
  | { kind: "gap"; segment: string }
  | { kind: "deficit"; covered: number }
  | { kind: "our-match"; with: "partner" | "opponent"; matchKey: string }
  | { kind: "second-opinion"; scouters: number }

export interface Slot {
  matchKey: string
  station: Station
  teamNumber: number
  score: number
  /** distinct scouters with an entry for this robot in this match */
  scouters: number
  /** position among upcoming matches, 0 = next */
  idx: number
  /** the match is already on the field */
  started: boolean
  reason: Reason
}

export interface Recommendation {
  primary: Slot | null
  alternates: Array<Slot>
  /** every candidate, best first (the S1 list) */
  all: Array<Slot>
}

const LEVEL = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 } as const

function order(a: RecMatch, b: RecMatch): number {
  return (
    (a.scheduledTime ?? Infinity) - (b.scheduledTime ?? Infinity) ||
    LEVEL[a.compLevel] - LEVEL[b.compLevel] ||
    a.setNumber - b.setNumber ||
    a.matchNumber - b.matchNumber
  )
}

const SEGMENT_NAMES = ["early", "middle", "late"]

/** Segment of the i-th of n quals: floor(S·i/n) (S1.1). n = 10 → 4 / 3 / 3. */
export function segmentOf(i: number, n: number, segments: number): number {
  return Math.floor((segments * i) / n)
}

function segmentName(s: number, segments: number): string {
  return segments === 3 ? (SEGMENT_NAMES[s] ?? "late") : `part ${s + 1}`
}

/** FNV-1a 32-bit: the same on every device, so offline scouters agree. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function stationsOf(m: RecMatch): Array<[Station, number]> {
  return [
    ...m.red.map((t, i): [Station, number] => [STATION_ORDER[i] ?? "red1", t]),
    ...m.blue.map((t, i): [Station, number] => [
      STATION_ORDER[i + 3] ?? "blue1",
      t,
    ]),
  ]
}

export function recommendSlots(
  input: RecommendInput,
  config: RecommenderConfig
): Recommendation {
  const W = config.weights
  const S = config.segments
  const sorted = [...input.matches].sort(order)
  const upcoming = sorted.filter((m) => m.status !== "played")
  const idxOf = new Map(upcoming.map((m, i) => [m.key, i]))

  // scouters per (match, team), mine, and totals per team
  const scouters = new Map<string, Set<string>>()
  const totalPerTeam = new Map<number, number>()
  const mine = new Set<string>()
  for (const e of input.entries) {
    const k = `${e.matchKey}|${e.teamNumber}`
    let set = scouters.get(k)
    if (!set) scouters.set(k, (set = new Set()))
    if (!set.has(e.authorId)) {
      set.add(e.authorId)
      totalPerTeam.set(e.teamNumber, (totalPerTeam.get(e.teamNumber) ?? 0) + 1)
    }
    if (e.authorId === input.userId) mine.add(k)
  }
  const count = (m: string, t: number) => scouters.get(`${m}|${t}`)?.size ?? 0

  // our next match: partners and opponents
  const ourNext =
    input.ourTeam === null
      ? undefined
      : upcoming.find(
          (m) =>
            m.red.includes(input.ourTeam ?? -1) ||
            m.blue.includes(input.ourTeam ?? -1)
        )
  const ourSide = ourNext?.red.includes(input.ourTeam ?? -1) ? "red" : "blue"
  const relation = (t: number): "partner" | "opponent" | null => {
    if (!ourNext || t === input.ourTeam) return null
    if (ourNext[ourSide].includes(t)) return "partner"
    if (ourNext[ourSide === "red" ? "blue" : "red"].includes(t))
      return "opponent"
    return null
  }

  const quals = sorted.filter((m) => m.compLevel === "qm")
  const upcomingQuals = upcoming.filter((m) => m.compLevel === "qm")
  const playoffMode = upcomingQuals.length === 0
  const horizon = (playoffMode ? upcoming : upcomingQuals).slice(
    0,
    config.horizonMatches
  )

  // per-team qual schedule
  const schedule = new Map<number, Array<RecMatch>>()
  for (const m of quals)
    for (const [, t] of stationsOf(m)) {
      const list = schedule.get(t)
      if (list) list.push(m)
      else schedule.set(t, [m])
    }

  const candidates: Array<Slot> = []
  for (const m of horizon) {
    const idx = idxOf.get(m.key) ?? 0
    for (const [station, t] of stationsOf(m)) {
      const k = `${m.key}|${t}`
      const n = count(m.key, t)
      if (n >= config.maxScoutersPerSlot) continue
      if (mine.has(k) || input.myDrafts?.has(k)) continue
      const rel = relation(t)
      const dupTerm = n >= 1 ? W.duplicate : 0
      const soon = W.soonness * idx

      if (playoffMode) {
        const ours = rel === "opponent" ? W.ourMatch : 0
        candidates.push({
          matchKey: m.key,
          station,
          teamNumber: t,
          score: ours + dupTerm + soon,
          scouters: n,
          idx,
          started: m.status === "onField",
          reason:
            ours > 0 && ourNext
              ? { kind: "our-match", with: "opponent", matchKey: ourNext.key }
              : { kind: "second-opinion", scouters: n },
        })
        continue
      }

      const q = schedule.get(t) ?? []
      const pos = q.findIndex((x) => x.key === m.key)
      const total = q.length
      const segOf = (i: number) => segmentOf(i, total, S)
      const s = segOf(pos)
      const inSeg = q.filter((_, i) => segOf(i) === s)
      const coveredIn = (list: ReadonlyArray<RecMatch>) =>
        list.filter((x) => count(x.key, t) >= config.targetScoutersPerSlot)
          .length
      const gap = Math.max(0, config.targetPerSegment - coveredIn(inSeg))
      const remaining = Math.max(
        1,
        inSeg.filter((x) => x.status !== "played").length
      )
      const segmentsWithMatches = new Set(q.map((_, i) => segOf(i))).size
      const deficit = Math.max(
        0,
        segmentsWithMatches * config.targetPerSegment - coveredIn(q)
      )

      const gapTerm = gap > 0 ? W.segmentGap + W.lastChance / remaining : 0
      const deficitTerm = W.teamDeficit * deficit
      const ourTerm = rel ? W.ourMatch : 0
      const watchTerm = input.watched.has(t) ? W.watched : 0
      const score = gapTerm + deficitTerm + dupTerm + soon + ourTerm + watchTerm

      const name = segmentName(s, S)
      const terms: Array<[number, Reason]> = [
        [
          gapTerm,
          remaining === 1
            ? { kind: "last-chance", segment: name }
            : { kind: "gap", segment: name },
        ],
        [deficitTerm, { kind: "deficit", covered: coveredIn(q) }],
        [
          ourTerm,
          {
            kind: "our-match",
            with: rel ?? "partner",
            matchKey: ourNext?.key ?? m.key,
          },
        ],
      ]
      const best = terms.filter(([v]) => v > 0).sort((a, b) => b[0] - a[0])[0]
      candidates.push({
        matchKey: m.key,
        station,
        teamNumber: t,
        score,
        scouters: n,
        idx,
        started: m.status === "onField",
        reason: best ? best[1] : { kind: "second-opinion", scouters: n },
      })
    }
  }

  const tieBreak = (a: Slot, b: Slot) =>
    a.idx - b.idx ||
    (totalPerTeam.get(a.teamNumber) ?? 0) -
      (totalPerTeam.get(b.teamNumber) ?? 0) ||
    STATION_ORDER.indexOf(a.station) - STATION_ORDER.indexOf(b.station) ||
    a.teamNumber - b.teamNumber
  const all = candidates.sort((a, b) => b.score - a.score || tieBreak(a, b))
  const top = all[0]
  if (!top) return { primary: null, alternates: [], all }

  // spread: robots in the same match within the band, picked by a per-user hash
  const band = all
    .filter(
      (c) =>
        c.matchKey === top.matchKey && c.score >= top.score - config.spreadBand
    )
    .sort(tieBreak)
  const primary =
    band.length > 1
      ? (band[fnv1a(input.userId + top.matchKey) % band.length] ?? top)
      : top

  const rest = all.filter((c) => c !== primary)
  const distinct: Array<Slot> = []
  const seen = new Set([primary.teamNumber])
  for (const c of rest)
    if (!seen.has(c.teamNumber) && distinct.length < 4) {
      distinct.push(c)
      seen.add(c.teamNumber)
    }
  for (const c of rest)
    if (distinct.length < 4 && !distinct.includes(c)) distinct.push(c)
  return { primary, alternates: distinct, all }
}

/**
 * The Needs Scouting page's groups (owner): matches in schedule order, and inside each match the
 * robots by alliance and station (Red 1–3, then Blue 1–3), not by score.
 */
export function groupByMatch(
  slots: ReadonlyArray<Slot>
): Array<[matchKey: string, slots: Array<Slot>]> {
  const groups = new Map<string, Array<Slot>>()
  for (const s of [...slots].sort((a, b) => a.idx - b.idx)) {
    const list = groups.get(s.matchKey)
    if (list) list.push(s)
    else groups.set(s.matchKey, [s])
  }
  for (const list of groups.values())
    list.sort(
      (a, b) =>
        STATION_ORDER.indexOf(a.station) - STATION_ORDER.indexOf(b.station)
    )
  return [...groups]
}
