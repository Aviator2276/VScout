import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { DataState } from "@/lib/db/react/data-state"
import type { MatchRecord } from "@/lib/db/types"
import { createTestRuntime } from "@/testing/data-runtime"
import { toDomain } from "@/testing/factories/records"
import { TEST_EVENT, wireMatch } from "@/testing/factories/wire"
import { useEventMatches } from "../api/get-matches"
import { MatchListView } from "../components/match-list-view"
import type { MatchListViewProps } from "../components/match-list-view"
import { matchesSearch } from "../types/matches-search"
import type { Coverage } from "../utils/match-view"

const NOW = Date.UTC(2026, 2, 20, 15, 30)

function match(n: number, o: Parameters<typeof wireMatch>[0] = {}) {
  return toDomain("match", wireMatch({ matchNumber: n, ...o }))
}

const schedule: Array<MatchRecord> = [
  match(1, {
    status: "played",
    alliances: {
      red: {
        teamNumbers: [254, 1678, 971],
        score: 112,
        surrogates: [],
        dqs: [],
      },
      blue: {
        teamNumbers: [2276, 604, 846],
        score: 98,
        surrogates: [],
        dqs: [],
      },
    },
    winningAlliance: "red",
  }),
  match(2),
  match(3),
]

function view(o: Partial<MatchListViewProps> = {}) {
  const props: MatchListViewProps = {
    state: { status: "success", data: schedule },
    coverage: new Map<string, Coverage>([
      [`${TEST_EVENT}_qm1`, [2, 0, 1, 1, 1, 1]],
    ]),
    context: { nicknames: new Map(), videos: new Set(), timeZone: "UTC" },
    search: matchesSearch.parse({}),
    onSearchChange: vi.fn(),
    ourTeam: 2276,
    watched: new Set(),
    canScout: true,
    now: NOW,
    ...o,
  }
  render(
    <App theme="ios">
      <MatchListView {...props} />
    </App>
  )
  return props
}

describe("MatchListView states (matches.md M1 data states)", () => {
  it("loading: a labelled status while the query runs", async () => {
    view({ state: { status: "loading" } })
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Loading matches…"
    )
  })

  it("empty: the schedule isn't published yet", () => {
    view({ state: { status: "empty" } })
    expect(screen.getByText("No matches yet")).toBeInTheDocument()
  })

  it("missing: never synced while offline", () => {
    view({ state: { status: "missing", reason: "not-synced" } })
    expect(
      screen.getByText("Match schedule not downloaded yet")
    ).toBeInTheDocument()
  })

  it("error: says so and Retry re-runs the query", async () => {
    const retry = vi.fn()
    view({
      state: {
        status: "error",
        error: { code: "db", message: "boom", retryable: true } as never,
        retry,
      },
    })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn’t load matches."
    )
    await userEvent.click(screen.getByRole("button", { name: "Try Again" }))
    expect(retry).toHaveBeenCalled()
  })

  it("no results: filter-specific copy and Clear Filters (criterion 11)", async () => {
    const p = view({
      search: matchesSearch.parse({ ours: true }),
      ourTeam: 9999,
    })
    expect(screen.getByText("No matches for 9999 yet")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Clear Filters" }))
    expect(p.onSearchChange).toHaveBeenCalledWith(
      expect.objectContaining({ ours: undefined, status: "any" })
    )
  })
})

describe("MatchListView rows", () => {
  it("rows carry set size and position, Up next, and the score", () => {
    view()
    const rows = screen.getAllByRole("listitem")
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveAttribute("aria-setsize", "3")
    expect(rows[1]).toHaveAttribute("aria-posinset", "2")
    expect(
      within(rows[1] as HTMLElement).getByText("Up next")
    ).toBeInTheDocument()
    expect(
      within(rows[0] as HTMLElement).getByText("Red won 112 to 98")
    ).toBeInTheDocument()
    expect(
      within(rows[0] as HTMLElement).getByText("Red alliance: 254, 1678, 971")
    ).toBeInTheDocument()
  })

  it("coverage dots say what each station has (criterion 15)", () => {
    view()
    const row = screen.getAllByRole("listitem")[0] as HTMLElement
    expect(
      within(row).getByRole("img", { name: "Red 2: not scouted" })
    ).toHaveAttribute("data-count", "0")
    expect(
      within(row).getByRole("img", { name: "Red 1: scouted 2 times" })
    ).toHaveAttribute("data-count", "2")
  })

  it("guests see no coverage and no Unscouted chip", () => {
    view({ canScout: false })
    expect(screen.queryByRole("img", { name: /Red 1/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Unscouted/ })).toBeNull()
  })

  it("Ours is disabled without a team number, and chips write the URL (criterion 10)", async () => {
    const p = view({ ourTeam: null })
    expect(screen.getByRole("button", { name: "Ours" })).toBeDisabled()
    await userEvent.click(screen.getByRole("button", { name: "Upcoming" }))
    expect(p.onSearchChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: "upcoming" })
    )
  })

  it("filters on each keystroke and writes the URL once, 300 ms after the last key (criterion 7)", async () => {
    const p = view()
    await userEvent.type(screen.getByLabelText("Search matches"), "q12")
    expect(screen.queryAllByRole("listitem")).toHaveLength(0)
    expect(screen.getByText("Showing: Qual 12")).toBeInTheDocument()
    expect(p.onSearchChange).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(p.onSearchChange).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 350))
    expect(p.onSearchChange).toHaveBeenCalledTimes(1)
    expect(p.onSearchChange).toHaveBeenCalledWith({ q: "q12" })
  })
})

function Harness({
  children,
}: {
  children: (s: DataState<ReadonlyArray<MatchRecord>>) => ReactNode
}) {
  return <>{children(useEventMatches(TEST_EVENT))}</>
}

describe("useEventMatches (criterion 18)", () => {
  it("is loading, never empty, while the first download runs; then shows the rows", async () => {
    const t = createTestRuntime()
    await t.seedScope(`event:${TEST_EVENT}`, "match", {
      bootstrapState: "running",
    })
    render(
      <App theme="ios">
        <t.wrapper>
          <Harness>{(s) => <span data-testid="s">{s.status}</span>}</Harness>
        </t.wrapper>
      </App>
    )
    await vi.waitFor(() =>
      expect(screen.getByTestId("s")).toHaveTextContent("loading")
    )
    await t.db.matches.bulkPut(schedule)
    await vi.waitFor(() =>
      expect(screen.getByTestId("s")).toHaveTextContent("success")
    )
  })

  it("never synced and offline: missing / not-synced", async () => {
    const t = createTestRuntime()
    t.setOnline(false)
    render(
      <t.wrapper>
        <Harness>
          {(s) => (
            <span data-testid="s">
              {s.status === "missing" ? s.reason : s.status}
            </span>
          )}
        </Harness>
      </t.wrapper>
    )
    await vi.waitFor(() =>
      expect(screen.getByTestId("s")).toHaveTextContent("not-synced")
    )
  })
})
