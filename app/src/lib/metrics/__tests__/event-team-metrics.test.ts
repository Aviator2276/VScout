import { describe, expect, it } from "vitest"
import { game } from "@/games/__fixtures__/test-game/definition"
import { toDomain } from "@/testing/factories/records"
import {
  TEST_EVENT,
  wireEventTeam,
  wireMatch,
  wirePitScouting,
  wireScoutEntry,
} from "@/testing/factories/wire"
import { computeEventTeamMetrics } from "../event-team-metrics"
import type { EventData } from "../event-team-metrics"

const played = (n: number, red: Array<number>, blue: Array<number>) =>
  toDomain(
    "match",
    wireMatch({
      matchNumber: n,
      status: "played",
      alliances: {
        red: { teamNumbers: red, score: 10, surrogates: [], dqs: [] },
        blue: { teamNumbers: blue, score: 5, surrogates: [], dqs: [] },
      },
    })
  )

const entry = (n: number, team: number, rating: number) =>
  toDomain(
    "scoutEntry",
    wireScoutEntry({
      matchKey: `${TEST_EVENT}_qm${n}`,
      teamNumber: team,
      station: "red1",
      scouterLevel: "experienced",
      data: { "teleop.role": "offense", "teleop.widgetRating": rating },
    })
  )

function data(o: Partial<EventData> = {}): EventData {
  return {
    teams: [254, 1678],
    matches: [1, 2, 3, 4, 5].map((n) => played(n, [254, 1, 2], [1678, 3, 4])),
    entries: [],
    pit: [],
    post: [],
    allianceRanks: [],
    eventTeams: [
      toDomain(
        "eventTeam",
        wireEventTeam({ teamNumber: 254, stats: { epa: 42 } })
      ),
      toDomain(
        "eventTeam",
        wireEventTeam({
          teamNumber: 1678,
          stats: { epa: { total_points: { mean: 51.5 } } },
        })
      ),
    ],
    weights: {},
    ...o,
  }
}

describe("computeEventTeamMetrics (teams.md T1, ADR-020)", () => {
  it("computes each game metric, with not-enough-data below the sample minimum", () => {
    const out = computeEventTeamMetrics(
      game,
      data({
        entries: [entry(1, 254, 4), entry(2, 254, 2), entry(1, 1678, 5)],
      }),
      "all"
    )
    expect(out.get(254)?.metrics.consistency).toMatchObject({
      value: 3,
      sampleSize: 2,
    })
    expect(out.get(1678)?.metrics.consistency).toMatchObject({
      value: null,
      sampleSize: 1,
    })
    expect(out.get(254)?.coveredMatches).toBe(2)
  })

  it("Recent 4 uses only the last four played matches (criterion 10)", () => {
    const entries = [1, 2, 3, 4, 5].map((n) => entry(n, 254, n === 1 ? 1 : 5))
    const all = computeEventTeamMetrics(game, data({ entries }), "all")
    const recent = computeEventTeamMetrics(game, data({ entries }), "recent")
    expect(all.get(254)?.metrics.consistency).toMatchObject({ value: 4.2 })
    expect(recent.get(254)?.metrics.consistency).toMatchObject({ value: 5 })
  })

  it("reads external stats by generic key or by the game's path", () => {
    const out = computeEventTeamMetrics(game, data(), "all")
    expect(out.get(254)?.external.epa).toBe(42)
    expect(out.get(1678)?.external.epa).toBe(51.5)
  })

  it("pit status, drivetrain and claimed capabilities come from the latest pit entry", () => {
    const pit = [
      toDomain("pitScouting", wirePitScouting({ teamNumber: 254 })),
      toDomain(
        "pitScouting",
        wirePitScouting({
          teamNumber: 1678,
          data: { "pit.gizmoGrabber": "none" },
          robot: { drivetrain: "tank" },
          photos: ["01900000-0000-7000-8000-000000000777"],
        })
      ),
    ]
    const out = computeEventTeamMetrics(game, data({ pit }), "all")
    expect(out.get(254)).toMatchObject({
      pit: "partial",
      drivetrain: "swerve",
      capabilities: { grabber: { claimed: true, observed: false } },
    })
    expect(out.get(1678)).toMatchObject({
      pit: "full",
      drivetrain: "tank",
      capabilities: { grabber: { claimed: false } },
    })
  })

  it("a metric that throws is an error cell; the others still compute", () => {
    const broken = {
      ...game,
      metrics: [
        ...game.metrics,
        {
          ...game.metrics[0],
          id: "boom",
          compute: () => {
            throw new Error("boom")
          },
        },
      ],
    } as typeof game
    const out = computeEventTeamMetrics(broken, data(), "all")
    expect(out.get(254)?.metrics.boom).toEqual({ error: true })
    expect(out.get(254)?.metrics.reliability).toBeDefined()
  })

  it("computes 60 teams × 1,000 entries within the main-thread budget (criterion 11)", () => {
    const teams = Array.from({ length: 60 }, (_, i) => 1000 + i)
    const matches = Array.from({ length: 80 }, (_, i) =>
      played(
        i + 1,
        [
          teams[(i * 6) % 60] ?? 1,
          teams[(i * 6 + 1) % 60] ?? 2,
          teams[(i * 6 + 2) % 60] ?? 3,
        ],
        [
          teams[(i * 6 + 3) % 60] ?? 4,
          teams[(i * 6 + 4) % 60] ?? 5,
          teams[(i * 6 + 5) % 60] ?? 6,
        ]
      )
    )
    const entries = Array.from({ length: 1000 }, (_, i) => {
      const m = matches[i % 80]
      const team = m?.teamNumbers[i % 6] ?? 1000
      return entry((i % 80) + 1, team, (i % 5) + 1)
    })
    const t0 = performance.now()
    const out = computeEventTeamMetrics(
      game,
      data({ teams, matches, entries }),
      "all"
    )
    const ms = performance.now() - t0
    expect(out.size).toBe(60)
    // budget 50 ms on a mid-range phone; CI machines are faster, jsdom/node slower to warm up
    expect(ms).toBeLessThan(150)
  })
})
