import { describe, expect, it } from "vitest"
import {
  DEFAULT_RECOMMENDER,
  recommenderConfig,
} from "@/lib/contracts/event-settings"
import {
  fnv1a,
  groupByMatch,
  recommendSlots,
  segmentOf,
} from "../utils/recommend-slots"
import type {
  RecEntry,
  RecMatch,
  RecommendInput,
} from "../utils/recommend-slots"

const T0 = Date.UTC(2026, 2, 20, 16, 0)
let filler = 9000

function q(
  n: number,
  teams: Array<number>,
  status: RecMatch["status"] = "scheduled",
  compLevel: RecMatch["compLevel"] = "qm"
): RecMatch {
  const all = [...teams]
  while (all.length < 6) all.push(++filler)
  return {
    key: compLevel === "qm" ? `2026casj_qm${n}` : `2026casj_${compLevel}${n}m1`,
    compLevel,
    setNumber: compLevel === "qm" ? 1 : n,
    matchNumber: compLevel === "qm" ? n : 1,
    scheduledTime: T0 + n * 7 * 60_000,
    status,
    red: all.slice(0, 3),
    blue: all.slice(3, 6),
  }
}

const entry = (m: RecMatch, team: number, authorId = "other"): RecEntry => ({
  matchKey: m.key,
  teamNumber: team,
  authorId,
})

/** Fill every robot except `keep` with two entries, so only `keep` can be recommended. */
function saturate(m: RecMatch, keep: Array<number>): Array<RecEntry> {
  return [...m.red, ...m.blue]
    .filter((t) => !keep.includes(t))
    .flatMap((t) => [entry(m, t, "x"), entry(m, t, "y")])
}

function input(
  o: Partial<RecommendInput> & Pick<RecommendInput, "matches">
): RecommendInput {
  return { entries: [], userId: "me", ourTeam: null, watched: new Set(), ...o }
}

describe("segments (criterion 1)", () => {
  it("12 quals split 4/4/4, 10 split 4/3/3", () => {
    expect(Array.from({ length: 12 }, (_, i) => segmentOf(i, 12, 3))).toEqual([
      0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
    ])
    expect(Array.from({ length: 10 }, (_, i) => segmentOf(i, 10, 3))).toEqual([
      0, 0, 0, 0, 1, 1, 1, 2, 2, 2,
    ])
  })
})

describe("the worked example (S1.5, criterion 2)", () => {
  // 254: Q1–Q7 played (indices 0–6), Q31 (index 7, its last middle match), Q41–Q44 later
  // 1678: Q8–Q13 played (indices 0–5), Q31 (6), Q38 (7), Q45–Q48 later
  const played = (n: number, t: number) => q(n, [t], "played")
  const matches = [
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => played(n, 254)),
    ...[8, 9, 10, 11, 12, 13].map((n) => played(n, 1678)),
    q(31, [254, 1678]),
    q(38, [1678]),
    ...[41, 42, 43, 44].map((n) => q(n, [254])),
    ...[45, 46, 47, 48].map((n) => q(n, [1678])),
  ]
  const byKey = (n: number) =>
    matches.find((m) => m.matchNumber === n) as RecMatch
  const entries = [
    // one covered early match each
    entry(byKey(1), 254),
    entry(byKey(8), 1678),
    ...saturate(byKey(31), [254, 1678]),
    ...saturate(byKey(38), [1678]),
  ]
  const config = { ...DEFAULT_RECOMMENDER, horizonMatches: 2 }

  it("scores 180, 150, 146 and picks Q31 · 254", () => {
    const r = recommendSlots(input({ matches, entries }), config)
    expect(
      r.all.map((s) => [s.matchKey.split("_")[1], s.teamNumber, s.score])
    ).toEqual([
      ["qm31", 254, 180],
      ["qm31", 1678, 150],
      ["qm38", 1678, 146],
    ])
    expect(r.primary).toMatchObject({
      teamNumber: 254,
      reason: { kind: "last-chance", segment: "middle" },
    })
    expect(r.alternates[0]).toMatchObject({
      matchKey: byKey(31).key,
      teamNumber: 1678,
    })
  })

  it("once 254 is scouted in Q31, Q31 · 1678 is next", () => {
    const r = recommendSlots(
      input({ matches, entries: [...entries, entry(byKey(31), 254, "sam")] }),
      config
    )
    expect(r.primary).toMatchObject({
      teamNumber: 1678,
      matchKey: byKey(31).key,
    })
  })
})

describe("candidates (criteria 3–5)", () => {
  it("skips full slots, my own entries and my drafts", () => {
    const m = q(1, [1, 2, 3, 4, 5, 6])
    const entries = [entry(m, 1, "a"), entry(m, 1, "b"), entry(m, 2, "me")]
    const r = recommendSlots(
      input({ matches: [m], entries, myDrafts: new Set([`${m.key}|3`]) }),
      DEFAULT_RECOMMENDER
    )
    const teams = r.all.map((s) => s.teamNumber)
    expect(teams).not.toContain(1)
    expect(teams).not.toContain(2)
    expect(teams).not.toContain(3)
    expect(teams).toEqual(expect.arrayContaining([4, 5, 6]))
  })

  it("ties break by earlier match, fewer scouters, station order, team number", () => {
    const m = q(1, [30, 20, 10, 60, 50, 40])
    const r = recommendSlots(input({ matches: [m] }), {
      ...DEFAULT_RECOMMENDER,
      spreadBand: 0,
    })
    // equal scores: station order wins
    expect(r.all.map((s) => s.station)).toEqual([
      "red1",
      "red2",
      "red3",
      "blue1",
      "blue2",
      "blue3",
    ])
  })
})

describe("spread (criterion 6)", () => {
  it("two users get the robot at fnv1a(userId + matchKey) mod k", () => {
    const m = q(14, [1, 2, 3], "scheduled")
    const entries = saturate(m, [1, 2, 3])
    const pick = (userId: string) =>
      recommendSlots(
        input({ matches: [m], entries, userId }),
        DEFAULT_RECOMMENDER
      ).primary?.teamNumber
    const users = ["alex", "sam", "kim", "lee", "pat"]
    const picks = users.map(pick)
    users.forEach((u, i) =>
      expect(picks[i]).toBe([1, 2, 3][fnv1a(u + m.key) % 3])
    )
    expect(new Set(picks).size).toBeGreaterThan(1)
  })
})

describe("config (criteria 7–8)", () => {
  it("uses stored weights and ignores the old claimTtlSec", () => {
    const parsed = recommenderConfig.parse({
      claimTtlSec: 90,
      weights: { segmentGap: 50 },
    })
    const m = q(1, [1])
    const r = recommendSlots(
      input({ matches: [m], entries: saturate(m, [1]) }),
      parsed
    )
    // 50 + 60/1 + 10 × 1 = 120
    expect(r.primary?.score).toBe(120)
  })
})

describe("playoffs (criterion 11)", () => {
  it("our next opponents rank first", () => {
    const m1 = q(1, [2276, 2, 3, 41, 42, 43], "scheduled", "sf")
    const m2 = q(2, [5, 6, 7, 8, 9, 10], "scheduled", "sf")
    const r = recommendSlots(
      input({ matches: [q(99, [1], "played"), m1, m2], ourTeam: 2276 }),
      DEFAULT_RECOMMENDER
    )
    expect(
      r.all
        .slice(0, 3)
        .map((s) => s.teamNumber)
        .sort()
    ).toEqual([41, 42, 43])
  })
})

describe("performance (criterion 12)", () => {
  it("60 teams × 12 quals × 2 entries in under 40 ms", () => {
    const teams = Array.from({ length: 60 }, (_, i) => 100 + i)
    const matches = Array.from({ length: 120 }, (_, i) =>
      q(
        i + 1,
        Array.from({ length: 6 }, (_k, k) => teams[(i * 6 + k) % 60] ?? 1),
        i < 60 ? "played" : "scheduled"
      )
    )
    const entries = matches
      .slice(0, 60)
      .flatMap((m) =>
        [...m.red, ...m.blue].flatMap((t) => [
          entry(m, t, "a"),
          entry(m, t, "b"),
        ])
      )
    recommendSlots(input({ matches, entries }), DEFAULT_RECOMMENDER)
    const t0 = performance.now()
    const r = recommendSlots(input({ matches, entries }), DEFAULT_RECOMMENDER)
    expect(performance.now() - t0).toBeLessThan(40)
    expect(r.primary).not.toBeNull()
  })
})

describe("groupByMatch (Needs Scouting page order)", () => {
  it("matches in schedule order, robots red 1–3 then blue 1–3", () => {
    const slot = (
      matchKey: string,
      idx: number,
      station: string,
      team: number
    ) =>
      ({
        matchKey,
        idx,
        station,
        teamNumber: team,
        score: team,
        scouters: 0,
        started: false,
        reason: { kind: "deficit", covered: 0 },
      }) as unknown as Parameters<typeof groupByMatch>[0][number]
    const groups = groupByMatch([
      slot("qm2", 1, "blue1", 4),
      slot("qm1", 0, "blue3", 3),
      slot("qm1", 0, "red2", 2),
      slot("qm2", 1, "red1", 5),
      slot("qm1", 0, "red1", 1),
    ])
    expect(groups.map(([k, s]) => [k, s.map((x) => x.station)])).toEqual([
      ["qm1", ["red1", "red2", "blue3"]],
      ["qm2", ["red1", "blue1"]],
    ])
  })
})
