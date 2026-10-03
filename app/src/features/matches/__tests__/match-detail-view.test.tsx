// Match detail (features/matches.md M2, ADR-078): per-robot lines, prediction, Watch For, breakdown,
// and where Scout a Robot lives.
import { render, screen, within } from "@testing-library/react"
import { App } from "konsta/react"
import { describe, expect, it } from "vitest"
import { game } from "@/games/__fixtures__/test-game/definition"
import type { MatchRecord } from "@/lib/db/types"
import type { TeamMetrics } from "@/lib/metrics/event-team-metrics"
import { toDomain } from "@/testing/factories/records"
import { TEST_EVENT, wireMatch, wireScoutEntry } from "@/testing/factories/wire"
import { MatchDetailView } from "../components/match-detail-view"
import type { MatchDetailViewProps } from "../components/match-detail-view"

const KEY = `${TEST_EVENT}_qm12`
const NOW = Date.UTC(2026, 2, 20, 12)

function match(played: boolean, o: Partial<MatchRecord> = {}): MatchRecord {
  return {
    ...toDomain(
      "match",
      wireMatch({
        matchNumber: 12,
        status: played ? "played" : "scheduled",
        winningAlliance: played ? "red" : null,
        alliances: {
          red: {
            teamNumbers: [254, 1678, 971],
            score: played ? 120 : null,
            surrogates: [],
            dqs: [],
          },
          blue: {
            teamNumbers: [2276, 604, 846],
            score: played ? 100 : null,
            surrogates: [],
            dqs: [],
          },
        },
      })
    ),
    ...o,
  }
}

function metrics(
  team: number,
  o: { reliability?: number; epa?: number | null; covered?: number } = {}
): TeamMetrics {
  return {
    teamNumber: team,
    metrics: {
      reliability: {
        value: o.reliability ?? 0.95,
        sampleSize: 5,
        confidence: "medium",
      },
    },
    capabilities: {},
    capabilityValues: {},
    external: { epa: o.epa === undefined ? 20.4 : o.epa },
    pit: "none",
    coveredMatches: o.covered ?? 5,
    drivetrain: "unknown",
  }
}

const allTeams = [254, 1678, 971, 2276, 604, 846]
const byTeam = (o: Record<number, Parameters<typeof metrics>[1]> = {}) =>
  new Map(allTeams.map((t) => [t, metrics(t, o[t])]))

function view(o: Partial<MatchDetailViewProps> = {}) {
  const props: MatchDetailViewProps = {
    game,
    state: { status: "success", data: match(false) },
    label: "Qual 12",
    teams: new Map(),
    coverage: undefined,
    entries: [],
    metrics: byTeam(),
    notes: { status: "empty" },
    showCoverage: true,
    ourTeam: null,
    now: NOW,
    strategyHref: `/scout/strategy/${KEY}`,
    scoutAction: <button type="button">Scout a Robot</button>,
    ...o,
  }
  render(
    <App theme="ios">
      <MatchDetailView {...props} />
    </App>
  )
}

const row = (team: number) => {
  const link = screen.getByRole("link", { name: String(team) })
  return link.closest("tr") as HTMLElement
}

describe("match detail (matches.md M2)", () => {
  it("played: each robot's line from this match, Not scouted otherwise (criterion 19)", () => {
    view({
      state: { status: "success", data: match(true) },
      entries: [
        toDomain(
          "scoutEntry",
          wireScoutEntry({
            matchKey: KEY,
            teamNumber: 254,
            data: {
              "auto.effectiveness": 4,
              "teleop.widgetRating": 3,
              incidents: [],
            },
          })
        ),
      ],
    })
    const [head] = within(screen.getByRole("table")).getAllByRole("rowgroup")
    expect(
      within(head as HTMLElement)
        .getAllByRole("columnheader")
        .map((h) => h.textContent)
    ).toEqual(["Team", "Auto", "Widgets", "Stops"])
    expect(
      within(row(254))
        .getAllByRole("cell")
        .map((c) => c.textContent)
    ).toEqual(["4", "3", "0"])
    expect(within(row(1678)).getByRole("cell")).toHaveTextContent("Not scouted")
    expect(screen.queryByRole("group", { name: /Predicted/ })).toBeNull()
  })

  it("upcoming: the first pre-match section's metrics per robot", () => {
    view()
    const [head] = within(screen.getByRole("table")).getAllByRole("rowgroup")
    expect(
      within(head as HTMLElement)
        .getAllByRole("columnheader")
        .map((h) => h.textContent)
    ).toEqual(["Team", "Reliability"])
    expect(within(row(254)).getByRole("cell")).toHaveTextContent("95%")
  })

  it("upcoming: the predicted score when every robot has a value (criterion 20)", () => {
    view()
    // 3 × 20.4 = 61.2 → 61 per alliance
    expect(
      screen.getByRole("group", { name: "Predicted score: Red 61, Blue 61" })
    ).toBeInTheDocument()
    expect(screen.getByText("From EPA")).toBeInTheDocument()
  })

  it("an upcoming column no robot has a value for isn't shown", () => {
    view({
      metrics: new Map(
        allTeams.map((t) => [
          t,
          {
            ...metrics(t),
            metrics: {
              reliability: {
                value: null,
                sampleSize: 0,
                confidence: "low" as const,
              },
            },
          },
        ])
      ),
    })
    const [head] = within(screen.getByRole("table")).getAllByRole("rowgroup")
    expect(
      within(head as HTMLElement)
        .getAllByRole("columnheader")
        .map((h) => h.textContent)
    ).toEqual(["Team"])
  })

  it("no prediction when a robot is missing a value (criterion 20)", () => {
    view({ metrics: byTeam({ 604: { epa: null } }) })
    expect(screen.queryByRole("group", { name: /Predicted/ })).toBeNull()
  })

  it("Watch For lists unreliable robots and little data (criterion 21)", () => {
    view({
      metrics: byTeam({ 971: { reliability: 0.6 }, 846: { covered: 1 } }),
    })
    const watch = screen.getByRole("region", { name: "Watch For" })
    expect(
      within(watch)
        .getAllByRole("listitem")
        .map((li) => li.textContent)
    ).toEqual(["971: reliability 60% over 5 matches", "Little data on 846"])
  })

  it("no Watch For when every robot is fine (criterion 21)", () => {
    view()
    expect(screen.queryByRole("region", { name: "Watch For" })).toBeNull()
  })

  it("Scout a Robot and Pre-Match Strategy show before the match, not after (criterion 22)", () => {
    view()
    expect(
      screen.getByRole("button", { name: "Scout a Robot" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Pre-Match Strategy" })
    ).toBeInTheDocument()
  })

  it("a played match has neither", () => {
    view({ state: { status: "success", data: match(true) } })
    expect(screen.queryByRole("button", { name: "Scout a Robot" })).toBeNull()
    expect(
      screen.queryByRole("link", { name: "Pre-Match Strategy" })
    ).toBeNull()
  })

  it("the TBA breakdown (criterion 23)", () => {
    view({
      state: {
        status: "success",
        data: match(true, {
          scoreBreakdown: { red: { autoPoints: 40 }, blue: { autoPoints: 35 } },
        }),
      },
    })
    const table = screen.getByRole("table", { name: "Score breakdown" })
    expect(within(table).getByRole("row", { name: /Auto/ })).toHaveTextContent(
      "Auto4035"
    )
  })

  it("alliances are labelled with the word, not color alone (ADR-044)", () => {
    view()
    expect(
      screen.getByRole("rowgroup", { name: "Red Alliance" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("rowgroup", { name: "Blue Alliance" })
    ).toBeInTheDocument()
  })

  it("missing and not synced", () => {
    view({ state: { status: "missing", reason: "not-found" } })
    expect(screen.getByText("Qual 12 isn’t in this event")).toBeInTheDocument()
  })
})
