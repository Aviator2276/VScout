import { describe, expect, it } from "vitest"
import {
  activeFilterCount,
  forRole,
  matchesSearch,
} from "../types/matches-search"
import type { MatchesSearch } from "../types/matches-search"
import { filterMatches } from "../utils/filter-matches"
import type { FilterContext } from "../utils/filter-matches"
import {
  longMatchLabel,
  parseMatchKey,
  shortMatchLabel,
} from "@/utils/match-label"
import { coverageByMatch, NO_COVERAGE, STATIONS } from "../utils/match-view"
import type { Coverage, MatchView } from "../utils/match-view"
import { parseMatchQuery } from "../utils/parse-match-query"
import { nextMatch, sortAndSection } from "../utils/sort-and-section-matches"

const FRI = Date.UTC(2026, 2, 20, 17, 0)
const SAT = Date.UTC(2026, 2, 21, 17, 0)

function view(
  n: number,
  o: Partial<MatchView> & { teams?: [Array<number>, Array<number>] } = {}
): MatchView {
  const level = o.compLevel ?? "qm"
  const [red, blue] = o.teams ?? [
    [n * 10 + 1, n * 10 + 2, n * 10 + 3],
    [n * 10 + 4, n * 10 + 5, n * 10 + 6],
  ]
  return {
    key: `2026casj_${level}${level === "qm" ? n : `${o.setNumber ?? n}m${o.matchNumber ?? 1}`}`,
    compLevel: level,
    setNumber: o.setNumber ?? 1,
    matchNumber: o.matchNumber ?? n,
    label: `Q${n}`,
    longLabel: `Qual ${n}`,
    time: FRI + n * 7 * 60_000,
    predicted: false,
    red,
    blue,
    redScore: null,
    blueScore: null,
    winner: null,
    played: false,
    onField: false,
    status: "scheduled",
    coverage: NO_COVERAGE,
    ...o,
  }
}

const search = (o: Partial<MatchesSearch> = {}): MatchesSearch => ({
  ...matchesSearch.parse({}),
  ...o,
})

const ctx = (o: Partial<FilterContext> = {}): FilterContext => ({
  ourTeam: 2276,
  watched: new Set(),
  nicknames: new Map(),
  videos: new Set(),
  ...o,
})

describe("match labels (round-1 criterion 9: playoff naming)", () => {
  it("names quals, playoff sets, replays and finals", () => {
    const q = { compLevel: "qm", setNumber: 1, matchNumber: 12 } as const
    expect(shortMatchLabel(q)).toBe("Q12")
    expect(longMatchLabel(q)).toBe("Qual 12")
    const sf = { compLevel: "sf", setNumber: 3, matchNumber: 1 } as const
    expect(shortMatchLabel(sf)).toBe("SF 3")
    expect(longMatchLabel(sf)).toBe("Semifinal 3")
    expect(shortMatchLabel({ ...sf, matchNumber: 2 })).toBe("SF 3-2")
    const f = { compLevel: "f", setNumber: 1, matchNumber: 2 } as const
    expect(shortMatchLabel(f)).toBe("F 2")
    expect(longMatchLabel(f)).toBe("Final 2")
    expect(parseMatchKey("2026casj_sf3m1")).toEqual(sf)
    expect(parseMatchKey("2026casj_qm12")).toEqual(q)
    expect(parseMatchKey("nope")).toBeNull()
  })
})

describe("search (matches.md criteria 3–6)", () => {
  const list = [
    view(12),
    view(254, {
      teams: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    }),
    view(1, {
      teams: [
        [254, 1678, 3],
        [4, 5, 6],
      ],
    }),
    view(2, {
      teams: [
        [254, 7, 8],
        [2276, 5, 6],
      ],
    }),
    view(3, {
      teams: [
        [9, 10, 11],
        [1678, 12, 13],
      ],
    }),
  ]
  const run = (q: string, c = ctx()) =>
    filterMatches(list, parseMatchQuery(q, c.ourTeam), search(), c).map(
      (m) => m.key
    )

  it("q12 finds only Qual 12 and reads 'Qual 12'", () => {
    expect(run("q12")).toEqual(["2026casj_qm12"])
    expect(run("qual 12")).toEqual(["2026casj_qm12"])
    expect(parseMatchQuery("q12", null).readAs).toEqual(["Qual 12"])
  })

  it("a bare number is that team's matches plus that qual; several numbers mean all of them", () => {
    expect(run("254")).toEqual([
      "2026casj_qm254",
      "2026casj_qm1",
      "2026casj_qm2",
    ])
    expect(run("254 1678")).toEqual(["2026casj_qm1"])
  })

  it("'us' is our team; without a team number the token is ignored with a hint", () => {
    expect(run("us")).toEqual(["2026casj_qm2"])
    const q = parseMatchQuery("us", null)
    expect(q.noTeamNumber).toBe(true)
    expect(q.empty).toBe(true)
  })

  it("nicknames match by word prefix, without case or accents", () => {
    const c = ctx({
      nicknames: new Map([
        [1678, "Citrus Circuits"],
        [9, "Tëch Titans"],
      ]),
    })
    expect(run("citrus", c)).toEqual(["2026casj_qm1", "2026casj_qm3"])
    expect(run("tech", c)).toEqual(["2026casj_qm3"])
    expect(run("ch", c)).toEqual([])
  })

  it("reads playoff tokens", () => {
    const sf = [
      view(1, { compLevel: "sf", setNumber: 3, matchNumber: 1 }),
      view(2, { compLevel: "sf", setNumber: 4, matchNumber: 1 }),
      view(3, { compLevel: "f", setNumber: 1, matchNumber: 2 }),
    ]
    const r = (q: string) =>
      filterMatches(sf, parseMatchQuery(q, null), search(), ctx()).length
    expect(r("sf3")).toBe(1)
    expect(r("sf 4")).toBe(1)
    expect(r("final 2")).toBe(1)
    expect(r("f1m2")).toBe(1)
  })
})

describe("filters (criteria 8–11)", () => {
  it("falls back to defaults for bad values", () => {
    const s = matchesSearch.parse({ scouted: "bogus", sort: "nope" })
    expect(s).toMatchObject({ scouted: "any", sort: "schedule" })
  })

  it("ignores scouter-only filters for guests", () => {
    const s = forRole(search({ scouted: "none", sort: "least-scouted" }), false)
    expect(s).toMatchObject({ scouted: "any", sort: "schedule" })
  })

  it("counts active filters", () => {
    expect(activeFilterCount(search({ ours: true, status: "upcoming" }))).toBe(
      2
    )
    expect(activeFilterCount(search({ q: "254", sort: "recent" }))).toBe(0)
  })

  it("combines ours, watched, status, level, team, video and coverage", () => {
    const full: Coverage = [1, 1, 2, 1, 1, 1]
    const list = [
      view(1, {
        teams: [
          [2276, 1, 2],
          [3, 4, 5],
        ],
        played: true,
        coverage: full,
      }),
      view(2, {
        teams: [
          [2276, 1, 2],
          [3, 4, 5],
        ],
      }),
      view(3, {
        teams: [
          [254, 1, 2],
          [3, 4, 5],
        ],
        coverage: [0, 1, 1, 1, 1, 1],
      }),
      view(4, { compLevel: "sf", setNumber: 1, matchNumber: 1 }),
    ]
    const run = (s: Partial<MatchesSearch>, c = ctx()) =>
      filterMatches(list, parseMatchQuery("", null), search(s), c).map(
        (m) => m.matchNumber
      )
    expect(run({ ours: true })).toEqual([1, 2])
    expect(run({ ours: true, status: "upcoming" })).toEqual([2])
    expect(run({ status: "played" })).toEqual([1])
    expect(run({ watched: true }, ctx({ watched: new Set([254]) }))).toEqual([
      3,
    ])
    expect(run({ level: "playoff" })).toEqual([1])
    expect(run({ team: 254 })).toEqual([3])
    expect(run({ scouted: "full" })).toEqual([1])
    expect(run({ scouted: "partial" })).toEqual([3])
    expect(run({ scouted: "none" })).toEqual([2, 3, 1])
    expect(
      run({ video: true }, ctx({ videos: new Set(["2026casj_qm2"]) }))
    ).toEqual([2])
  })
})

describe("sections and the Now divider (criteria 1, 12)", () => {
  const list = [
    view(1, { played: true }),
    view(2, { played: true, onField: false }),
    view(3, { onField: true }),
    view(4, { time: SAT }),
    view(1, { compLevel: "sf", setNumber: 1, matchNumber: 1, time: SAT }),
  ]

  it("schedule: day sections, playoffs, Now between played and unplayed, Up next marked", () => {
    const up = nextMatch(list)
    // Q3 is on the field, so Q4 is up next
    expect(up?.matchNumber).toBe(4)
    const s = sortAndSection(list, "schedule", {
      timeZone: "America/Los_Angeles",
      upNextKey: up?.key ?? null,
    })
    expect(
      s.items.map((i) => (i.kind === "row" ? i.match.label : i.title))
    ).toEqual([
      "Qualifications · Friday",
      "Q1",
      "Q2",
      "Q3",
      "Qualifications · Saturday",
      "Now · Qual 3 on field",
      "Q4",
      "Playoffs",
      "Q1",
    ])
    expect(s.items[s.upNextIndex]).toMatchObject({ upNext: true })
    expect(s.nowIndex).toBe(5)
    expect(s.rowCount).toBe(5)
  })

  it("recent: played first, sections reversed, no Now divider", () => {
    const s = sortAndSection(list, "recent", {
      timeZone: "America/Los_Angeles",
      upNextKey: null,
    })
    expect(s.items[0]).toMatchObject({ kind: "header", title: "Playoffs" })
    expect(s.nowIndex).toBe(-1)
    expect(s.items.some((i) => i.kind === "now")).toBe(false)
  })

  it("least scouted: played matches only, most unscouted robots first", () => {
    const l = [
      view(1, { played: true, coverage: [1, 1, 1, 1, 1, 1] }),
      view(2, { played: true, coverage: [0, 0, 1, 1, 1, 1] }),
      view(3, { played: true, coverage: [0, 1, 1, 1, 1, 2] }),
      view(4),
    ]
    const s = sortAndSection(l, "least-scouted", {
      timeZone: "UTC",
      upNextKey: null,
    })
    expect(
      s.items.flatMap((i) => (i.kind === "row" ? [i.match.matchNumber] : []))
    ).toEqual([2, 3, 1])
  })

  it("groups 1,000 entries into coverage quickly", () => {
    const entries = Array.from({ length: 1000 }, (_, i) => ({
      matchKey: `m${i % 96}`,
      station: STATIONS[i % 6] ?? "red1",
    }))
    const t0 = performance.now()
    const map = coverageByMatch(entries)
    expect(performance.now() - t0).toBeLessThan(10)
    expect(map.get("m0")?.reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
  })
})
