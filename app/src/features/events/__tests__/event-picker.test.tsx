import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import { describe, expect, it, vi } from "vitest"
import { createTestRuntime } from "@/testing/data-runtime"
import { EventPicker } from "../components/event-picker"

const event = (
  key: string,
  name: string,
  startDate: string,
  endDate: string,
  isDemo = false
) =>
  ({
    key,
    id: key,
    name,
    year: 2026,
    startDate,
    endDate,
    isDemo,
    rev: 1,
    updatedAt: 0,
  }) as never

describe("EventPicker", () => {
  it("lists current events before past ones, marks the selected one, and picks", async () => {
    const t = createTestRuntime()
    await t.seedScope("global", "event")
    await t.db.events.bulkPut([
      event("2026casj", "Silicon Valley Regional", "2026-03-19", "2026-03-22"),
      event("2026cafr", "Central Valley Regional", "2026-10-15", "2026-10-18"),
      event("2026demo", "Demo Event", "2026-10-01", "2026-10-02", true),
    ])
    const onPick = vi.fn()
    render(
      <App theme="ios">
        <t.wrapper>
          <EventPicker
            selectedKey="2026cafr"
            today="2026-10-01"
            onPick={onPick}
          />
        </t.wrapper>
      </App>
    )
    expect(
      await screen.findByText("Central Valley Regional")
    ).toBeInTheDocument()
    const headings = screen
      .getAllByText(/^(Events|Past Events)$/)
      .map((h) => h.textContent)
    expect(headings).toEqual(["Events", "Past Events"])
    expect(screen.getByText("Demo Event (Demo)")).toBeInTheDocument()
    expect(screen.getByLabelText("Selected")).toBeInTheDocument()
    expect(screen.getByText("Mar 19–22, 2026")).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: /Silicon Valley Regional/ })
    )
    expect(onPick).toHaveBeenCalledWith("2026casj")
  })

  it("shows only a guest's event, and says when nothing is downloaded yet", async () => {
    const t = createTestRuntime()
    await t.seedScope("global", "event")
    await t.db.events.bulkPut([
      event("2026casj", "Silicon Valley Regional", "2026-03-19", "2026-03-22"),
      event("2026cafr", "Central Valley Regional", "2026-10-15", "2026-10-18"),
    ])
    const { unmount } = render(
      <App theme="ios">
        <t.wrapper>
          <EventPicker
            selectedKey={null}
            today="2026-10-01"
            onPick={() => undefined}
            onlyKey="2026casj"
          />
        </t.wrapper>
      </App>
    )
    expect(
      await screen.findByText("Silicon Valley Regional")
    ).toBeInTheDocument()
    expect(screen.queryByText("Central Valley Regional")).toBeNull()
    unmount()

    const offline = createTestRuntime()
    offline.setOnline(false)
    render(
      <offline.wrapper>
        <EventPicker
          selectedKey={null}
          today="2026-10-01"
          onPick={() => undefined}
        />
      </offline.wrapper>
    )
    expect(
      await screen.findByText("Events aren't on this device yet")
    ).toBeInTheDocument()
  })
})
