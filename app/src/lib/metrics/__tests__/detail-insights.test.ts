// Team and match page insights (ADR-078): ranks, trends, per-match summaries, prediction, Watch For,
// breakdown. Criteria from features/teams.md T2 and features/matches.md M2.
import { describe, expect, it } from "vitest"
import { game } from "@/games/2026-rebuilt/definition"
import { capabilityValueLabel } from "@/games/kit/capability-label"
import type { GameDefinition, MetricResult } from "@/games/types"
import type { MetricCell, TeamMetrics } from "../event-team-metrics"
import { breakdownRows, predictScore, watchFor } from "../match-outlook"
import { matchSummary, summaryColumns } from "../match-summary"
import { formatRank, metricRank, metricTrend } from "../metric-standing"

const cell = (value: number | null, sampleSize = 5): MetricResult => ({
  value,
  sampleSize,
  confidence: "medium",
})

function team(
  teamNumber: number,
  o: {
    metrics?: Record<string, MetricCell>
    external?: Record<string, number | null>
    coveredMatches?: number
  } = {}
): TeamMetrics {
  return {
    teamNumber,
    metrics: o.metrics ?? {},
    capabilities: {},
    capabilityValues: {},
    external: o.external ?? {},
    pit: "none",
    coveredMatches: o.coveredMatches ?? 5,
    drivetrain: "unknown",
  }
}

const byTeam = (...teams: Array<TeamMetrics>) =>
  new Map(teams.map((t) => [t.teamNumber, t]))

describe("metric rank (teams.md T2 criterion 18)", () => {
  const map = byTeam(
    team(1, { metrics: { reliability: cell(0.9) } }),
    team(2, { metrics: { reliability: cell(0.8) } }),
    team(3, { metrics: { reliability: cell(0.8) } }),
    team(4, { metrics: { reliability: cell(null, 1) } }),
    team(5, { metrics: { reliability: { error: true } } })
  )
  const def = { id: "reliability", higherIsBetter: true }

  it("ranks among teams with a value; ties share a rank", () => {
    expect([1, 2, 3].map((n) => metricRank(map, def, n))).toEqual([
      { rank: 1, of: 3 },
      { rank: 2, of: 3 },
      { rank: 2, of: 3 },
    ])
    expect(metricRank(map, def, 4)).toBeNull()
    expect(metricRank(map, def, 5)).toBeNull()
    expect(metricRank(undefined, def, 1)).toBeNull()
  })

  it("lower is better ranks the smallest first", () => {
    expect(
      metricRank(map, { id: "reliability", higherIsBetter: false }, 2)
    ).toEqual({ rank: 1, of: 3 })
  })

  it("reads as an ordinal", () => {
    expect(
      [1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map((rank) =>
        formatRank({ rank, of: 40 })
      )
    ).toEqual([
      "1st of 40",
      "2nd of 40",
      "3rd of 40",
      "4th of 40",
      "11th of 40",
      "12th of 40",
      "13th of 40",
      "21st of 40",
      "22nd of 40",
      "23rd of 40",
    ])
  })
})

describe("last-4 trend (teams.md T2 criterion 19)", () => {
  const score = { format: "score5", higherIsBetter: true } as const
  it("up on a higher-is-better metric is good", () => {
    expect(metricTrend(score, cell(3.0), cell(3.6))).toEqual({
      direction: "up",
      good: true,
      text: "Up 0.6 in last 4",
    })
  })
  it("down on a lower-is-better percent is good, in percentage points", () => {
    expect(
      metricTrend(
        { format: "percent", higherIsBetter: false },
        cell(0.5),
        cell(0.42)
      )
    ).toEqual({ direction: "down", good: true, text: "Down 8% in last 4" })
  })
  it("no trend when a side is missing or they read the same", () => {
    expect(metricTrend(score, cell(3), cell(null))).toBeNull()
    expect(metricTrend(score, undefined, cell(3))).toBeNull()
    expect(metricTrend(score, { error: true }, cell(3))).toBeNull()
    expect(metricTrend(score, cell(3.01), cell(3.02))).toBeNull()
    expect(
      metricTrend(
        { format: "percent", higherIsBetter: true },
        cell(0.9),
        cell(0.902)
      )
    ).toBeNull()
  })
})

describe("capability values read as labels (teams.md T2 criterion 20)", () => {
  const cap = (id: string) => {
    const c = game.capabilities.find((x) => x.id === id)
    if (!c) throw new Error(id)
    return c
  }
  it("uses the pit field's option label", () => {
    expect(capabilityValueLabel(game, cap("climbMax"), "level3")).toBe(
      "Level 3"
    )
    expect(capabilityValueLabel(game, cap("shooter"), "none")).toBe("None")
  })
  it("passes numbers and unknown values through; nothing is null", () => {
    expect(capabilityValueLabel(game, cap("climbMax"), 2)).toBe("2")
    expect(capabilityValueLabel(game, cap("climbMax"), "level9")).toBe("level9")
    expect(capabilityValueLabel(game, cap("climbMax"), null)).toBeNull()
    expect(capabilityValueLabel(game, cap("climbMax"), "")).toBeNull()
    expect(
      capabilityValueLabel(
        game,
        { ...cap("climbMax"), source: { robotProfile: "drivetrain" } },
        "swerve"
      )
    ).toBe("swerve")
  })
})

describe("per-match summary (M2 criterion 19, T2 criterion 22)", () => {
  const KEY = "2026test_qm12"
  const entry = (data: Record<string, unknown>, o = {}) => ({
    matchKey: KEY,
    data,
    ...o,
  })

  it("the game's short columns", () => {
    expect(summaryColumns(game).map((c) => c.label)).toEqual([
      "Auto",
      "Scoring",
      "Climb",
      "Stops",
    ])
  })

  it("one robot's cells, with option labels and counts", () => {
    const cells = matchSummary(game, KEY, [
      entry({
        "auto.effectiveness": 4,
        "teleop.scoringRating": 3,
        "endgame.climbResult": "level3",
        incidents: [],
      }),
    ])
    expect(cells?.map((c) => `${c.label} ${c.value}`)).toEqual([
      "Auto 4",
      "Scoring 3",
      "Climb Level 3",
      "Stops 0",
    ])
  })

  it("unanswered fields read —; other matches and unsupported entries are ignored", () => {
    const cells = matchSummary(game, KEY, [
      entry({ "auto.effectiveness": null }),
      { matchKey: "other", data: { "auto.effectiveness": 5 } },
      entry({ "auto.effectiveness": 1 }, { unsupported: true }),
    ])
    expect(cells?.map((c) => c.value)).toEqual(["—", "—", "—", "—"])
  })

  it("null when nobody scouted the robot", () => {
    expect(matchSummary(game, KEY, [])).toBeNull()
  })

  it("formats every field kind", () => {
    const kinds: GameDefinition = {
      ...game,
      matchForm: {
        id: "match",
        sections: [
          {
            id: "s",
            title: "x",
            fields: [
              { kind: "boolean", id: "b", label: "x" },
              { kind: "boolean", id: "b2", label: "x" },
              {
                kind: "multiChoice",
                id: "m",
                label: "x",
                options: [{ value: "a", label: "x" }],
              },
              {
                kind: "duration",
                id: "d",
                label: "x",
                buckets: [
                  {
                    value: "short",
                    label: "summary.auto",
                    minSec: 0,
                    maxSec: 5,
                  },
                ],
              },
              { kind: "duration", id: "d2", label: "x", buckets: [] },
              { kind: "count", id: "c", label: "x", min: 0, max: 9 },
              { kind: "number", id: "n", label: "x" },
              {
                kind: "text",
                id: "t",
                label: "x",
                multiline: false,
                maxLength: 9,
              },
              {
                kind: "fieldPosition",
                id: "p",
                label: "x",
                image: "field",
                mode: "point",
                mirrorForAlliance: false,
              },
              {
                kind: "choice",
                id: "ch",
                label: "x",
                options: [{ value: "a", label: "summary.climb" }],
              },
              { kind: "incidents", id: "i", label: "x" },
            ],
          },
        ],
      },
      detailPage: {
        matchSummary: [
          "b",
          "b2",
          "m",
          "d",
          "d2",
          "c",
          "n",
          "t",
          "p",
          "ch",
          "i",
          "gone",
        ].map((field) => ({ field, label: field })),
      },
    }
    const cells = matchSummary(kinds, KEY, [
      entry({
        b: true,
        b2: false,
        m: ["a"],
        d: "short",
        d2: "long",
        c: 3,
        t: "note",
        p: { x: 1 },
        ch: "zzz",
        i: [{ id: "1" }],
      }),
    ])
    expect(cells?.map((c) => c.value)).toEqual([
      "Yes",
      "No",
      "1",
      "Auto",
      "long",
      "3",
      "—",
      "note",
      "—",
      "zzz",
      "1",
    ])
  })

  it("a game without hints has no columns", () => {
    const { detailPage: _, ...bare } = game
    expect(summaryColumns(bare)).toEqual([])
  })
})

describe("predicted score (M2 criterion 20)", () => {
  const map = byTeam(
    ...[1, 2, 3, 4, 5, 6].map((n) => team(n, { external: { epa: n * 10.4 } })),
    team(7, { external: { epa: null } })
  )
  it("sums the prediction stat per alliance", () => {
    expect(predictScore(game, map, [1, 2, 3], [4, 5, 6])).toEqual({
      red: 62,
      blue: 156,
    })
  })
  it("needs every robot, the map and a prediction source", () => {
    expect(predictScore(game, map, [1, 2, 7], [4, 5, 6])).toBeNull()
    expect(predictScore(game, map, [1, 2, 3], [4, 5, 99])).toBeNull()
    expect(predictScore(game, undefined, [1], [2])).toBeNull()
    expect(predictScore(game, map, [], [4])).toBeNull()
    const { detailPage: _, ...bare } = game
    expect(predictScore(bare, map, [1, 2, 3], [4, 5, 6])).toBeNull()
  })
})

describe("Watch For (M2 criterion 21)", () => {
  it("lists unreliable robots and robots with little data", () => {
    const map = byTeam(
      team(3370, { metrics: { reliability: cell(0.6) } }),
      team(3111, { metrics: { reliability: cell(0.5, 1) }, coveredMatches: 1 }),
      team(254, { metrics: { reliability: cell(0.95) } }),
      team(9, { metrics: { reliability: { error: true } }, coveredMatches: 0 })
    )
    expect(watchFor(map, [3370, 3111, 254, 9, 404])).toEqual([
      "3370: reliability 60% over 5 matches",
      "3111: reliability 50% over 1 match",
      "Little data on 3111, 9",
    ])
  })
  it("says nothing when every robot is fine, and keeps to 3 lines", () => {
    const fine = byTeam(team(1, { metrics: { reliability: cell(0.9) } }))
    expect(watchFor(fine, [1])).toEqual([])
    expect(watchFor(undefined, [1])).toEqual([])
    const bad = byTeam(
      ...[1, 2, 3, 4].map((n) =>
        team(n, { metrics: { reliability: cell(0.1) } })
      )
    )
    expect(watchFor(bad, [1, 2, 3, 4])).toHaveLength(3)
  })
})

describe("score breakdown (M2 criterion 23)", () => {
  it("the game's rows TBA sent, labelled", () => {
    expect(
      breakdownRows(game, {
        red: { totalAutoPoints: 40, totalTeleopPoints: 90 },
        blue: { totalAutoPoints: 35 },
      })
    ).toEqual([
      { key: "autoPoints", label: "Auto", red: "40", blue: "35" },
      { key: "teleopPoints", label: "Teleop", red: "90", blue: "—" },
    ])
  })
  it("nothing without a breakdown", () => {
    expect(breakdownRows(game, null)).toEqual([])
    expect(breakdownRows(game, undefined)).toEqual([])
  })
})
