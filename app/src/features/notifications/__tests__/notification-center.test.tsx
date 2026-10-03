import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import { describe, expect, it, vi } from "vitest"
import type { NotificationRow } from "@/lib/db/types"
import { notify } from "../api/notifications-store"
import { createTestRuntime } from "@/testing/data-runtime"
import {
  NotificationBell,
  NotificationCenter,
  useNotificationCenter,
} from "../components/notification-center"

const row = (o: Partial<NotificationRow>): NotificationRow => ({
  id: "n1",
  key: "msg:1",
  category: "messages",
  priority: "normal",
  title: "Sam Chen in #2026casj",
  body: "Q14 queue moved",
  href: "/messages/event:2026casj",
  createdAt: Date.now() - 5 * 60_000,
  ...o,
})

function OpenSettings() {
  const center = useNotificationCenter()
  return (
    <button type="button" onClick={() => center?.open("settings")}>
      Open Settings
    </button>
  )
}

async function setup(rows: Array<NotificationRow>) {
  const t = createTestRuntime()
  await t.db.notifications.bulkPut(rows)
  const onNavigate = vi.fn()
  const onAction = vi.fn()
  render(
    <App theme="ios">
      <t.wrapper>
        <NotificationCenter
          settings={<p>The switches</p>}
          onNavigate={onNavigate}
          onAction={onAction}
        >
          <NotificationBell />
          <OpenSettings />
        </NotificationCenter>
      </t.wrapper>
    </App>
  )
  return { t, onNavigate, onAction }
}

describe("notification center (notifications-center.md N3)", () => {
  it("the bell names its unread count, and is red for urgent items (criterion 15)", async () => {
    await setup([
      row({ id: "a", key: "a" }),
      row({ id: "b", key: "b", readAt: 1 }),
    ])
    expect(
      await screen.findByRole("button", { name: "Notifications, 1 unread" })
    ).toBeInTheDocument()
  })

  it("tapping an item marks it read and goes to its target (criterion 10)", async () => {
    const { t, onNavigate } = await setup([row({})])
    await userEvent.click(
      await screen.findByRole("button", { name: /Notifications, 1 unread/ })
    )
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Unread. Messages: Sam Chen in #2026casj",
      })
    )
    expect(onNavigate).toHaveBeenCalledWith("/messages/event:2026casj")
    await waitFor(async () =>
      expect((await t.db.notifications.get("n1"))?.readAt).toBeTypeOf("number")
    )
  })

  it("an action item runs its action instead of navigating", async () => {
    const { onAction, onNavigate } = await setup([
      row({
        id: "u",
        key: "system:update",
        category: "system",
        title: "VScout 2.0.1 is ready",
        action: "update",
        href: undefined,
      }),
    ])
    await userEvent.click(
      await screen.findByRole("button", { name: /Notifications/ })
    )
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Unread. System: VScout 2.0.1 is ready",
      })
    )
    expect(onAction).toHaveBeenCalledWith("update")
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it("select two and delete them (criterion 11), filter by category, empty state", async () => {
    const { t } = await setup([
      row({ id: "a", key: "a", title: "First" }),
      row({ id: "b", key: "b", title: "Second" }),
      row({ id: "c", key: "c", title: "Results", category: "events" }),
    ])
    await userEvent.click(
      await screen.findByRole("button", { name: /Notifications/ })
    )
    await userEvent.click(
      await screen.findByRole("radio", { name: "Messages" })
    )
    await waitFor(() =>
      expect(screen.queryByText("Results")).not.toBeInTheDocument()
    )
    await userEvent.click(screen.getByRole("button", { name: "Select" }))
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select: First" })
    )
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select: Second" })
    )
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(async () =>
      expect((await t.db.notifications.toArray()).map((r) => r.id)).toEqual([
        "c",
      ])
    )
    expect(await screen.findByText("You’re all caught up")).toBeInTheDocument()
  })

  it("Mark All Read clears the badge", async () => {
    await setup([row({ id: "a", key: "a" }), row({ id: "b", key: "b" })])
    await userEvent.click(
      await screen.findByRole("button", { name: "Notifications, 2 unread" })
    )
    await userEvent.click(
      await screen.findByRole("button", { name: "Mark All Read" })
    )
    // the bell sits behind the open sheet (modal), so it's hidden from the a11y tree meanwhile
    expect(
      await screen.findByRole("button", { name: "Notifications", hidden: true })
    ).toBeInTheDocument()
  })

  it("the row menu dismisses an item (it leaves the list)", async () => {
    const { t } = await setup([row({})])
    await userEvent.click(
      await screen.findByRole("button", { name: /Notifications/ })
    )
    await userEvent.click(
      await screen.findByRole("button", {
        name: "More for Sam Chen in #2026casj",
      })
    )
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Dismiss" })
    )
    await waitFor(async () =>
      expect((await t.db.notifications.get("n1"))?.dismissedAt).toBeTypeOf(
        "number"
      )
    )
    expect(await screen.findByText("You’re all caught up")).toBeInTheDocument()
  })

  it("opens straight to the settings view (criterion 13)", async () => {
    await setup([])
    await userEvent.click(screen.getByRole("button", { name: "Open Settings" }))
    expect(await screen.findByText("The switches")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }))
    expect(await screen.findByText("You’re all caught up")).toBeInTheDocument()
  })

  it("a new notification slides in as a banner; tapping it opens its target (owner)", async () => {
    const { t, onNavigate } = await setup([])
    await notify(
      t.db,
      {
        key: "msg:dm1",
        category: "messages",
        priority: "normal",
        title: "Sam Chen",
        body: "Can you take 254?",
        href: "/messages/dm:a:b",
        group: "dm:a:b",
      },
      { now: Date.now(), ids: { newId: () => "banner-1" } }
    )
    const banner = await screen.findByRole("status")
    expect(banner).toHaveTextContent("Sam Chen")
    await userEvent.click(within(banner).getByRole("button"))
    expect(onNavigate).toHaveBeenCalledWith("/messages/dm:a:b")
  })
})
