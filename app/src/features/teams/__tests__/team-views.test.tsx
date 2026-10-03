import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import { describe, expect, it, vi } from "vitest"
import { game } from "@/games/__fixtures__/test-game/definition"
import type { TeamMetrics } from "@/lib/metrics/event-team-metrics"
import { toDomain } from "@/testing/factories/records"
import {
  TEST_EVENT,
  wireMatch,
  wirePitScouting,
  wirePostScouting,
  wireScoutEntry,
} from "@/testing/factories/wire"
import { TeamDetailView, TeamMatches } from "../components/team-detail-view"
import { TeamOverview } from "../components/team-overview"
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

  it("header and sub-view switcher: Overview · Matches · Notes", async () => {
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
    expect(
      screen
        .getAllByRole("radio")
        .map((r) => r.getAttribute("aria-label") ?? r.textContent)
    ).toHaveLength(3)
    expect(screen.queryByRole("radio", { name: "Pit" })).toBeNull()
    await userEvent.click(screen.getByRole("radio", { name: "Notes" }))
    expect(onViewChange).toHaveBeenCalledWith("notes")
  })

  it("no photo placeholder without a photo; a thumbnail with one (criterion 17)", () => {
    const { rerender } = render(
      <App theme="ios">
        <TeamDetailView
          state={{ status: "success", data: detail }}
          teamNumber={254}
          view="overview"
          onViewChange={vi.fn()}
        >
          {null}
        </TeamDetailView>
      </App>
    )
    expect(screen.queryByRole("img")).toBeNull()
    expect(screen.queryByText(/No robot photo/)).toBeNull()
    rerender(
      <App theme="ios">
        <TeamDetailView
          state={{ status: "success", data: detail }}
          teamNumber={254}
          view="overview"
          onViewChange={vi.fn()}
          photoUrl="/robot.jpg"
        >
          {null}
        </TeamDetailView>
      </App>
    )
    expect(
      screen.getByRole("img", { name: "Team 254’s robot. Show photos" })
    ).toHaveAttribute("src", "/robot.jpg")
  })
})

describe("TeamOverview (teams.md T2, ADR-078)", () => {
  const detail = {
    teamNumber: 254,
    nickname: "The Cheesy Poofs",
    city: "San Jose",
    rank: 1,
    rookieYear: 1999,
    record: { wins: 9, losses: 1, ties: 0 },
    rankingPoints: null,
    pitLocation: "A12",
  }
  const cell = (value: number | null, sampleSize = 6) => ({
    value,
    sampleSize,
    confidence: "medium" as const,
  })
  const team = (n: number, reliability: number | null, auto: number | null) =>
    metrics(n, {
      metrics: {
        reliability: cell(reliability, reliability === null ? 1 : 6),
        autoEffectiveness: cell(auto),
      },
    })
  const byTeam = new Map([
    [254, team(254, 0.8, 3.0)],
    [1678, team(1678, 0.9, 4.0)],
    [9999, team(9999, 0.8, null)],
    [604, team(604, null, 2.0)],
  ])

  function overview(o: Partial<Parameters<typeof TeamOverview>[0]> = {}) {
    const props: Parameters<typeof TeamOverview>[0] = {
      game,
      team: detail,
      window: "all",
      onWindowChange: vi.fn(),
      metrics: byTeam.get(254),
      recent: team(254, 0.8, 3.6),
      byTeam,
      pit: { status: "missing", reason: "not-scouted" },
      post: { status: "empty" },
      notes: { status: "empty" },
      onAllNotes: vi.fn(),
      ...o,
    }
    render(
      <App theme="ios">
        <TeamOverview {...props} />
      </App>
    )
    return props
  }
  const tile = (name: RegExp) =>
    screen
      .getAllByRole("listitem")
      .find((li) => name.test(li.getAttribute("aria-label") ?? ""))

  it("tiles: rank among teams with a value, ties shared, sample size (criterion 18)", () => {
    overview()
    expect(tile(/^Reliability/)).toHaveTextContent("80%")
    expect(tile(/^Reliability/)).toHaveTextContent("2nd of 3 · 6 matches")
    expect(tile(/^Reliability/)).toHaveAccessibleName(/medium confidence/)
    // consistency has no data for anyone
    expect(tile(/^Consistency/)).toHaveTextContent("—")
    expect(tile(/^Consistency/)).toHaveTextContent("No data")
  })

  it("not enough data reads —, with the sample size (criterion 18)", () => {
    overview({ metrics: byTeam.get(604) })
    expect(tile(/^Reliability/)).toHaveTextContent("Not enough data (1 match)")
  })

  it("a trend line with All Matches; none with Last 4 (criterion 19)", async () => {
    const props = overview()
    expect(tile(/^Auto/)).toHaveTextContent("Up 0.6 in last 4")
    expect(
      within(tile(/^Auto/) as HTMLElement).getByText("Up 0.6 in last 4")
    ).toHaveClass("text-success")
    await userEvent.click(screen.getByRole("radio", { name: "Last 4" }))
    expect(props.onWindowChange).toHaveBeenCalledWith("recent")
  })

  it("Last 4 hides the trend", () => {
    overview({ window: "recent" })
    expect(screen.queryByText(/in last 4/)).toBeNull()
  })

  it("capability chips: claimed vs observed, unknown is muted (round-1 criterion 5)", () => {
    overview({
      metrics: metrics(254, {
        capabilities: { grabber: { claimed: true, observed: true } },
      }),
    })
    expect(
      screen.getByRole("listitem", {
        name: "Grabber, pit says so, seen in a match",
      })
    ).toBeInTheDocument()
  })

  it("an unknown capability says so", () => {
    overview({
      metrics: metrics(254, {
        capabilities: { grabber: { claimed: false, observed: false } },
      }),
    })
    expect(
      screen.getByRole("listitem", { name: "Grabber · Unknown" })
    ).toBeInTheDocument()
  })

  it("the robot: not pit scouted yet, with the scout actions", () => {
    overview({ robotActions: <li>Pit Scout row</li> })
    expect(screen.getByText("Not pit scouted yet")).toBeInTheDocument()
    expect(screen.getByText("Pit Scout row")).toBeInTheDocument()
  })

  it("the robot: drivetrain, pit answers behind a disclosure, latest post-scouting (criterion 21)", async () => {
    const entry = toDomain("pitScouting", wirePitScouting())
    const post = [
      toDomain(
        "postScouting",
        wirePostScouting({ data: { "postForm.willingDefense": true } })
      ),
      toDomain(
        "postScouting",
        wirePostScouting({ data: { "postForm.willingDefense": false } })
      ),
    ]
    overview({
      pit: { status: "success", data: { entry, photos: [] } },
      post: { status: "success", data: post },
    })
    expect(screen.getByText("Swerve")).toBeInTheDocument()
    expect(screen.queryByText("Claw")).toBeNull()
    await userEvent.click(screen.getByText("Pit Answers"))
    expect(screen.getByText("Claw")).toBeInTheDocument()
    expect(screen.getByText("Post-Scouting")).toBeInTheDocument()
    expect(screen.getByText("Earlier Post-Scouting")).toBeInTheDocument()
  })

  it("a pit question nobody answered isn't a row", () => {
    const entry = toDomain(
      "pitScouting",
      wirePitScouting({ data: { "pit.gizmoGrabber": null } })
    )
    overview({ pit: { status: "success", data: { entry, photos: [] } } })
    expect(screen.getByText("Swerve")).toBeInTheDocument()
    expect(screen.queryByText("Pit Answers")).toBeNull()
  })

  it("notes preview: the newest 2 and All Notes (criterion 23)", async () => {
    const note = (i: number) => ({
      id: `n${i}`,
      body: `note ${i}`,
      authorName: "Sam",
      createdAt: 10 - i,
      private: false,
      syncState: "synced" as const,
    })
    const props = overview({
      notes: { status: "success", data: [1, 2, 3, 4, 5].map(note) },
    })
    expect(screen.getByText("note 1")).toBeInTheDocument()
    expect(screen.getByText("note 2")).toBeInTheDocument()
    expect(screen.queryByText("note 3")).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: "All Notes (5)" }))
    expect(props.onAllNotes).toHaveBeenCalled()
  })

  it("only rows with values: no Ranking Points row, no External without values", () => {
    overview({ metrics: metrics(254, { external: { epa: null } }) })
    expect(screen.getByText("A12")).toBeInTheDocument()
    expect(screen.queryByText("Ranking Points")).toBeNull()
    expect(screen.queryByText("External")).toBeNull()
  })

  it("external values show when there are some", () => {
    overview()
    expect(screen.getByText("External")).toBeInTheDocument()
    expect(screen.getByText("31.5")).toBeInTheDocument()
  })
})

describe("TeamMatches (teams.md T2 criterion 22)", () => {
  const match = (n: number, played: boolean) =>
    toDomain(
      "match",
      wireMatch({
        matchNumber: n,
        status: played ? "played" : "scheduled",
        winningAlliance: played ? (n === 2 ? "blue" : "red") : null,
        alliances: {
          red: {
            teamNumbers: n === 2 ? [1, 2, 3] : [254, 2, 3],
            score: played ? 80 : null,
            surrogates: [],
            dqs: [],
          },
          blue: {
            teamNumbers: n === 2 ? [254, 5, 6] : [4, 5, 6],
            score: played ? (n === 2 ? 90 : 70) : null,
            surrogates: [],
            dqs: [],
          },
        },
      })
    )
  const entry = (n: number, data: Record<string, unknown>) =>
    toDomain(
      "scoutEntry",
      wireScoutEntry({
        matchKey: `${TEST_EVENT}_qm${n}`,
        teamNumber: 254,
        data,
      })
    )
  const matches = [
    match(1, true),
    match(2, true),
    match(3, true),
    match(4, false),
    match(5, false),
  ]
  const entries = [
    entry(1, {
      "auto.effectiveness": 4,
      "teleop.widgetRating": 3,
      incidents: [],
    }),
    entry(2, {
      "auto.effectiveness": 2,
      "teleop.widgetRating": 5,
      incidents: [{}],
    }),
  ]

  function table(onScout?: (key: string) => void) {
    render(
      <App theme="ios">
        <TeamMatches
          game={game}
          state={{ status: "success", data: matches }}
          teamNumber={254}
          entries={entries}
          {...(onScout ? { onScout } : {})}
        />
      </App>
    )
  }

  it("played: the game's columns, values, results and Not scouted", () => {
    table(vi.fn())
    const played = screen.getByRole("table")
    expect(
      within(played)
        .getAllByRole("columnheader")
        .map((h) => h.textContent)
    ).toEqual(["Match", "Auto", "Widgets", "Stops"])
    const rows = within(played).getAllByRole("row").slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent("W 80–70")
    expect(rows[0]).toHaveTextContent(/4\s*3\s*0/)
    expect(rows[1]).toHaveTextContent("W 90–80")
    expect(rows[1]).toHaveTextContent(/2\s*5\s*1/)
    expect(rows[2]).toHaveTextContent("Not scouted")
  })

  it("upcoming: Scout buttons for scouters, none for guests", async () => {
    const onScout = vi.fn()
    table(onScout)
    const scout = screen.getAllByRole("button", { name: /^Scout 254 in/ })
    expect(scout).toHaveLength(2)
    await userEvent.click(scout[0] as HTMLElement)
    expect(onScout).toHaveBeenCalledWith(`${TEST_EVENT}_qm4`)
  })

  it("guests get no Scout buttons", () => {
    table()
    expect(screen.queryByRole("button", { name: /^Scout/ })).toBeNull()
    expect(screen.getByText("Upcoming")).toBeInTheDocument()
  })
})
