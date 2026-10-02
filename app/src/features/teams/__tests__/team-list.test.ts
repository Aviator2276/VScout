import { describe, expect, it } from "vitest"
import { game } from "@/games/__fixtures__/test-game/definition"
import type { TeamMetrics } from "@/lib/metrics/event-team-metrics"
import {
  activeFilterCount,
  forRole,
  teamsSearchFor,
} from "../types/teams-search"
import type { TeamsSearch } from "../types/teams-search"
import {
  matchQuality,
  parseTeamQuery,
  passesFilters,
  sortTeams,
} from "../utils/team-list"
import type { TeamRow } from "../utils/team-list"

const schema = teamsSearchFor(game)
const search = (o: Record<string, unknown> = {}): TeamsSearch => schema.parse(o)

const row = (
  teamNumber: number,
  nickname: string,
  rank: number | null
): TeamRow => ({
  teamNumber,
  nickname,
  city: null,
  rank,
})

function metrics(
  team: number,
  o: Partial<TeamMetrics> & { consistency?: number | null } = {}
): TeamMetrics {
  return {
    teamNumber: team,
    metrics: {
      consistency: {
        value: o.consistency === undefined ? null : o.consistency,
        sampleSize: 3,
        confidence: "low",
      },
    },
    capabilities: {},
    capabilityValues: {},
    external: {},
    pit: "none",
    coveredMatches: 0,
    drivetrain: "unknown",
    ...o,
  }
}

describe("teams search schema", () => {
  it("falls back to rank for a retired metric (criterion 5)", () => {
    expect(search({ sort: "retiredMetric" }).sort).toBe("rank")
    expect(search({ sort: "consistency" }).sort).toBe("consistency")
    expect(search({ sort: "epa" }).sort).toBe("epa")
  })

  it("drops a capability list with an unknown id, and counts filters", () => {
    expect(search({ cap: ["nope"] }).cap).toBeUndefined()
    const s = search({
      drivetrain: ["swerve"],
      cap: ["grabber"],
      capSource: "observed",
    })
    expect(activeFilterCount(s)).toBe(2)
  })

  it("ignores scouter-only filters for guests", () => {
    expect(
      forRole(search({ pit: "none", sort: "scouted" }), false)
    ).toMatchObject({
      pit: "any",
      sort: "rank",
    })
  })
})

describe("team search (criteria 2–3)", () => {
  const teams = [
    row(2541, "Ravens", 3),
    row(254, "The Cheesy Poofs", 2),
    row(25, "Raider Robotix", 1),
    row(1678, "Citrus Circuits", 4),
  ]

  it("number prefix, exact first", () => {
    const q = parseTeamQuery("25", null)
    const hits = teams.filter((t) => matchQuality(t, q, null) > 0)
    const sorted = sortTeams(game, hits, new Map(), "rank", undefined, (t) =>
      matchQuality(t, q, null)
    )
    expect(sorted.ranked.map((t) => t.teamNumber)).toEqual([25, 254, 2541])
  })

  it("names by word prefix only; terms are ORed", () => {
    const by = (s: string) =>
      teams
        .filter((t) => matchQuality(t, parseTeamQuery(s, 2541), 2541) > 0)
        .map((t) => t.teamNumber)
    expect(by("cheesy")).toEqual([254])
    expect(by("oo")).toEqual([])
    expect(by("1678 cheesy")).toEqual([254, 1678])
    expect(by("us")).toEqual([2541])
    expect(parseTeamQuery("us", null).noTeamNumber).toBe(true)
  })
})

describe("team sort (criteria 1, 4)", () => {
  it("rank order, then an Unranked group by number", () => {
    const teams = [
      row(5, "E", null),
      row(1, "A", 2),
      row(3, "C", null),
      row(2, "B", 1),
    ]
    const s = sortTeams(game, teams, new Map(), "rank", undefined)
    expect(s.ranked.map((t) => t.teamNumber)).toEqual([2, 1])
    expect(s.unranked.map((t) => t.teamNumber)).toEqual([3, 5])
  })

  it("metrics sort by higherIsBetter with nulls last in either direction", () => {
    const teams = [row(1, "A", 1), row(2, "B", 2), row(3, "C", 3)]
    const m = new Map([
      [1, metrics(1, { consistency: 3 })],
      [2, metrics(2, { consistency: null })],
      [3, metrics(3, { consistency: 4.5 })],
    ])
    expect(
      sortTeams(game, teams, m, "consistency", undefined).ranked.map(
        (t) => t.teamNumber
      )
    ).toEqual([3, 1, 2])
    expect(
      sortTeams(game, teams, m, "consistency", "asc").ranked.map(
        (t) => t.teamNumber
      )
    ).toEqual([1, 3, 2])
  })
})

describe("team filters (criteria 6–8)", () => {
  const ctx = { watched: new Set([7]), coverageTarget: 3 }

  it("drivetrain and observed capability", () => {
    const s = search({
      drivetrain: ["swerve"],
      cap: ["grabber"],
      capSource: "observed",
    })
    const a = metrics(1, {
      drivetrain: "swerve",
      capabilities: { grabber: { claimed: false, observed: true } },
    })
    const b = metrics(2, {
      drivetrain: "swerve",
      capabilities: { grabber: { claimed: true, observed: false } },
    })
    const c = metrics(3, { drivetrain: "tank" })
    expect(passesFilters(row(1, "", 1), a, s, ctx)).toBe(true)
    expect(passesFilters(row(2, "", 2), b, s, ctx)).toBe(false)
    expect(passesFilters(row(3, "", 3), c, s, ctx)).toBe(false)
  })

  it("needs pit, under-scouted, watched and top 8", () => {
    expect(
      passesFilters(row(1, "", 1), metrics(1), search({ pit: "none" }), ctx)
    ).toBe(true)
    expect(
      passesFilters(
        row(1, "", 1),
        metrics(1, { pit: "full" }),
        search({ pit: "none" }),
        ctx
      )
    ).toBe(false)
    expect(
      passesFilters(
        row(1, "", 1),
        metrics(1, { coveredMatches: 2 }),
        search({ coverage: "under-target" }),
        ctx
      )
    ).toBe(true)
    expect(
      passesFilters(
        row(1, "", 1),
        metrics(1, { coveredMatches: 3 }),
        search({ coverage: "under-target" }),
        ctx
      )
    ).toBe(false)
    expect(
      passesFilters(row(7, "", 1), metrics(7), search({ watched: true }), ctx)
    ).toBe(true)
    expect(
      passesFilters(row(8, "", 9), metrics(8), search({ ranked: "top8" }), ctx)
    ).toBe(false)
  })
})
