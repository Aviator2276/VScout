import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import { describe, expect, it, vi } from "vitest"
import { game } from "@/games/__fixtures__/test-game/definition"
import type { TeamMetrics } from "@/lib/metrics/event-team-metrics"
import { toDomain } from "@/testing/factories/records"
import { wirePitScouting } from "@/testing/factories/wire"
import {
  TeamDetailView,
  TeamOverview,
  TeamPitView,
} from "../components/team-detail-view"
import { TeamListView } from "../components/team-list-view"
import type { TeamListViewProps } from "../components/team-list-view"
import { teamsSearchFor } from "../types/teams-search"
import { resolveColumns } from "../utils/columns"

const search = teamsSearchFor(game)

const teams = [
  { teamNumber: 254, nickname: "The Cheesy Poofs", city: "San Jose", rank: 1 },
  { teamNumber: 1678, nickname: "Citrus Circuits", city: "Davis", rank: 2 },
  { teamNumber: 9999, nickname: "Newcomers", city: null, rank: null },
]

function metrics(team: number, o: Partial<TeamMetrics> = {}): TeamMetrics {
  return {
    teamNumber: team,
    metrics: {
      reliability: { value: 0.92, sampleSize: 6, confidence: "medium" },
      consistency: { value: null, sampleSize: 1, confidence: "low" },
    },
    capabilities: { grabber: { claimed: true, observed: false } },
    capabilityValues: {},
    external: { epa: 31.5 },
    pit: "none",
    coveredMatches: 1,
    drivetrain: "swerve",
    ...o,
  }
}

function list(o: Partial<TeamListViewProps> = {}) {
  const props: TeamListViewProps = {
    game,
    state: { status: "success", data: teams },
    metrics: new Map(teams.map((t) => [t.teamNumber, metrics(t.teamNumber)])),
    refreshing: false,
    coverageTarget: 3,
    columns: resolveColumns(game, undefined),
    search: search.parse({}),
    onSearchChange: vi.fn(),
    ourTeam: null,
    watched: new Set([1678]),
    canScout: true,
    ...o,
  }
  render(
    <App theme="ios">
      <TeamListView {...props} />
    </App>
  )
  return props
}

describe("TeamListView states (teams.md T1)", () => {
  it("loading", async () => {
    list({ state: { status: "loading" } })
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Loading teams…"
    )
  })

  it("empty: the event hasn't published teams", () => {
    list({ state: { status: "empty" } })
    expect(screen.getByText("No teams yet")).toBeInTheDocument()
  })

  it("missing: not downloaded yet", () => {
    list({ state: { status: "missing", reason: "not-synced" } })
    expect(screen.getByText("Team list not downloaded yet")).toBeInTheDocument()
  })

  it("error with Retry", async () => {
    const retry = vi.fn()
    list({
      state: {
        status: "error",
        error: { code: "db", message: "x", retryable: true } as never,
        retry,
      },
    })
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load teams.")
    await userEvent.click(screen.getByRole("button", { name: "Try Again" }))
    expect(retry).toHaveBeenCalled()
  })

  it("no results: filter copy and Clear Filters", async () => {
    const p = list({
      search: search.parse({ ranked: "top8", watched: true, pit: "full" }),
    })
    expect(screen.getByText("No teams with these filters")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Clear Filters" }))
    expect(p.onSearchChange).toHaveBeenCalledWith(
      expect.objectContaining({ pit: "any" })
    )
  })
})

describe("TeamListView rows", () => {
  it("ranked teams, then Unranked; metric chips read with sample sizes (criteria 1, 12)", () => {
    list()
    expect(
      screen.getByText("Unranked", { selector: "div" })
    ).toBeInTheDocument()
    const rows = screen.getAllByRole("listitem")
    expect(rows.map((r) => r.getAttribute("aria-posinset"))).toEqual([
      "1",
      "2",
      "3",
    ])
    const first = rows[0] as HTMLElement
    expect(within(first).getByText("Rank 1")).toBeInTheDocument()
    expect(
      within(first).getByText("92%", { selector: "[aria-hidden]" })
    ).toBeInTheDocument()
    expect(
      within(first).getByRole("img", { name: "Not pit scouted" })
    ).toBeInTheDocument()
    expect(
      within(rows[1] as HTMLElement).getByLabelText("Watched")
    ).toBeInTheDocument()
    expect(screen.getByText(/Sorted by Rank ↑ · 2 columns/)).toBeInTheDocument()
  })

  it("search shows best matches first and says so (criterion 2)", async () => {
    list()
    await userEvent.type(screen.getByLabelText("Search teams"), "cheesy")
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByText("Best matches for ‘cheesy’")).toBeInTheDocument()
  })

  it("Recent 4 shows the refreshing indicator, not a skeleton (criterion 10)", () => {
    list({ refreshing: true, search: search.parse({ window: "recent" }) })
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getByText(/Updating/)).toBeInTheDocument()
  })

  it("guests get no pit dots and no scouter chips", () => {
    list({ canScout: false })
    expect(screen.queryByRole("img", { name: "Not pit scouted" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Needs Pit" })).toBeNull()
  })
})

describe("TeamDetailView (teams.md T2)", () => {
  const detail = {
    teamNumber: 254,
    nickname: "The Cheesy Poofs",
    city: "San Jose",
    rank: 1,
    rookieYear: 1999,
    record: { wins: 9, losses: 1, ties: 0 },
    rankingPoints: 30,
    pitLocation: "A12",
  }

  it("not at this event, and not downloaded yet", () => {
    const { rerender } = render(
      <App theme="ios">
        <TeamDetailView
          state={{ status: "missing", reason: "not-found" }}
          teamNumber={9999}
          view="overview"
          onViewChange={vi.fn()}
        >
          {null}
        </TeamDetailView>
      </App>
    )
    expect(
      screen.getByText("Team 9999 isn’t at this event")
    ).toBeInTheDocument()
    rerender(
      <App theme="ios">
        <TeamDetailView
          state={{ status: "missing", reason: "not-synced" }}
          teamNumber={9999}
          view="overview"
          onViewChange={vi.fn()}
        >
          {null}
        </TeamDetailView>
      </App>
    )
    expect(screen.getByText("Team list not downloaded yet")).toBeInTheDocument()
  })

  it("header and sub-view switcher", async () => {
    const onViewChange = vi.fn()
    render(
      <App theme="ios">
        <TeamDetailView
          state={{ status: "success", data: detail }}
          teamNumber={254}
          view="overview"
          onViewChange={onViewChange}
        >
          <p>panel</p>
        </TeamDetailView>
      </App>
    )
    expect(screen.getByText("Rank 1 · 9-1-0 · San Jose")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("radio", { name: "Notes" }))
    expect(onViewChange).toHaveBeenCalledWith("notes")
  })

  it("overview: sample sizes, not-enough-data, and claimed vs observed (round-1 criterion 5)", () => {
    render(
      <App theme="ios">
        <TeamOverview game={game} team={detail} metrics={metrics(254)} />
      </App>
    )
    expect(
      screen.getByText("6 matches · Medium confidence")
    ).toBeInTheDocument()
    expect(screen.getByText("Not enough data (1 match)")).toBeInTheDocument()
    expect(screen.getByText("Pit says yes")).toBeInTheDocument()
  })

  it("pit: not scouted yet, then the robot and answers", () => {
    const { rerender } = render(
      <App theme="ios">
        <TeamPitView
          game={game}
          state={{ status: "missing", reason: "not-scouted" }}
        />
      </App>
    )
    expect(screen.getByText("Not pit scouted yet")).toBeInTheDocument()
    const entry = toDomain("pitScouting", wirePitScouting())
    rerender(
      <App theme="ios">
        <TeamPitView
          game={game}
          state={{ status: "success", data: { entry, photos: [] } }}
        />
      </App>
    )
    expect(screen.getByText("Swerve")).toBeInTheDocument()
    expect(screen.getByText("No robot photos yet")).toBeInTheDocument()
  })
})
