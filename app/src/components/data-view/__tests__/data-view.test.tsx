import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { DataState } from "@/lib/db/react/data-state"
import { DataView } from "../data-view"

afterEach(() => vi.useRealTimers())

const list = (
  state: DataState<ReadonlyArray<string>>,
  extra?: React.ReactNode
) =>
  render(
    <DataView state={state} size="page">
      {extra}
      <DataView.Success<ReadonlyArray<string>>>
        {(data, meta) => (
          <ul aria-label={meta.stale ? "Teams (stale)" : "Teams"}>
            {data.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </DataView.Success>
    </DataView>
  )

describe("DataView (data-states.md)", () => {
  it("renders success through the Success slot, with the stale flag", () => {
    list({ status: "success", data: ["254", "1678"], stale: true })
    expect(
      screen.getByRole("list", { name: "Teams (stale)" })
    ).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
  })

  it.each([
    [{ status: "idle" } as const, "Choose something to get started"],
    [{ status: "empty" } as const, "Nothing here yet"],
    [{ status: "missing", reason: "not-found" } as const, "This doesn't exist"],
    [
      { status: "missing", reason: "not-synced" } as const,
      "Not on this device yet",
    ],
    [{ status: "missing", reason: "not-scouted" } as const, "Not scouted yet"],
    [
      { status: "missing", reason: "forbidden" } as const,
      "You don't have access to this",
    ],
  ])("shows a status message for %j", (state, text) => {
    list(state)
    expect(screen.getByRole("status")).toHaveTextContent(text)
    expect(screen.queryByRole("list")).toBeNull()
  })

  it("shows an alert with the error message and a working retry", async () => {
    const retry = vi.fn()
    list({
      status: "error",
      error: {
        code: "db",
        message: "Couldn't read data on this device. Try again.",
      },
      retry,
    })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't read data on this device. Try again."
    )
    await userEvent.click(screen.getByRole("button", { name: "Try Again" }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it("announces loading at once but only shows it after 150 ms (no flash)", () => {
    vi.useFakeTimers()
    list({ status: "loading" })
    expect(screen.getByRole("status")).toHaveTextContent("Loading…")
    expect(screen.getByRole("status")).toHaveClass("sr-only")
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(screen.getByRole("status")).not.toHaveClass("sr-only")
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true")
  })

  it("uses a content-shaped skeleton when the feature provides one", () => {
    vi.useFakeTimers()
    list(
      { status: "loading" },
      <DataView.Loading label="Loading teams…">
        <div data-testid="skeleton" />
      </DataView.Loading>
    )
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(
      screen.getByRole("status", { name: "Loading teams…" })
    ).toBeInTheDocument()
    expect(screen.getByTestId("skeleton").parentElement).toHaveAttribute(
      "aria-hidden",
      "true"
    )
  })

  it("lets a feature override copy and add an action per state", () => {
    list(
      { status: "empty" },
      <DataView.Empty
        title="No comments yet"
        description="Add the first one."
        action={<button type="button">Add Comment</button>}
      />
    )
    expect(screen.getByRole("status")).toHaveTextContent("No comments yet")
    expect(
      screen.getByRole("button", { name: "Add Comment" })
    ).toBeInTheDocument()
  })

  it("overrides one missing reason without touching the others", () => {
    const { rerender } = render(
      <DataView state={{ status: "missing", reason: "not-found" }}>
        <DataView.Missing
          not-found={{ title: "Team 9999 isn't at this event" }}
        />
      </DataView>
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      "Team 9999 isn't at this event"
    )
    rerender(
      <DataView
        state={{ status: "missing", reason: "not-synced" }}
        size="inline"
      >
        <DataView.Missing
          not-found={{ title: "Team 9999 isn't at this event" }}
        />
      </DataView>
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      "Not on this device yet"
    )
  })

  it("renders nothing for success without a Success slot (a misuse, not a crash)", () => {
    const { container } = render(
      <DataView state={{ status: "success", data: 1 }} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
