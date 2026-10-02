import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { CalendarDays, House } from "@/components/icons/icon"
import { ComingSoon } from "../layout/coming-soon"
import { FullPageMessage } from "../layout/full-page-message"
import { ShellBannersContext } from "../layout/shell-banners"
import { StackPage } from "../layout/stack-page"
import { TabBar } from "../layout/tab-bar"
import {
  ForcedUpdateBanner,
  UpdateReadyBanner,
  UpdatedElsewhereBanner,
} from "../layout/update-banner"
import { SyncPill, describeSyncPill, syncPillState } from "../sync/sync-pill"

describe("TabBar", () => {
  const items = [
    { id: "home", label: "Home", icon: House, href: "/" },
    {
      id: "matches",
      label: "Matches",
      icon: CalendarDays,
      href: "/matches?level=qm",
    },
  ] as const

  it("is a labelled nav of links with the current tab marked", async () => {
    const onSelect = vi.fn()
    render(<TabBar items={items} active="home" onSelect={onSelect} />)
    expect(screen.getByRole("navigation", { name: "Tabs" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    const matches = screen.getByRole("link", { name: "Matches" })
    expect(matches).toHaveAttribute("href", "/matches?level=qm")
    expect(matches).not.toHaveAttribute("aria-current")
    await userEvent.click(matches)
    expect(onSelect).toHaveBeenCalledWith("matches")
  })

  it("leaves modified clicks to the browser (open in new tab)", async () => {
    const onSelect = vi.fn()
    render(<TabBar items={items} active={null} onSelect={onSelect} />)
    const user = userEvent.setup()
    await user.keyboard("{Meta>}")
    await user.click(screen.getByRole("link", { name: "Matches" }))
    await user.keyboard("{/Meta}")
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe("StackPage", () => {
  it("has one h1, the shell banners, and its actions", () => {
    render(
      <ShellBannersContext value={<p>Offline banner</p>}>
        <StackPage
          title="Teams"
          trailing={<button type="button">Sort</button>}
          banner={<p>Page banner</p>}
        >
          <p>Body</p>
        </StackPage>
      </ShellBannersContext>
    )
    expect(
      screen.getByRole("heading", { level: 1, name: "Teams" })
    ).toBeInTheDocument()
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByText("Offline banner")).toBeInTheDocument()
    expect(screen.getByText("Page banner")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sort" })).toBeInTheDocument()
    expect(screen.getByRole("main")).toHaveTextContent("Body")
  })

  it("inline mode keeps the h1 for screen readers", () => {
    render(
      <StackPage title="Match 12" titleMode="inline">
        <p>Body</p>
      </StackPage>
    )
    expect(
      screen.getByRole("heading", { level: 1, name: "Match 12" })
    ).toHaveClass("sr-only")
  })
})

describe("SyncPill (ui-patterns §7.1)", () => {
  const base = {
    online: true,
    syncing: false,
    pending: 0,
    conflicts: 0,
    rejected: 0,
  }

  it("picks the most important state", () => {
    expect(syncPillState(base)).toEqual({ kind: "synced" })
    expect(syncPillState({ ...base, pending: 3 })).toEqual({
      kind: "pending",
      count: 3,
    })
    expect(syncPillState({ ...base, pending: 3, syncing: true })).toEqual({
      kind: "syncing",
    })
    expect(syncPillState({ ...base, syncing: true, online: false })).toEqual({
      kind: "offline",
    })
    expect(syncPillState({ ...base, online: false, rejected: 1 })).toEqual({
      kind: "rejected",
      count: 1,
    })
    expect(syncPillState({ ...base, rejected: 1, conflicts: 2 })).toEqual({
      kind: "conflict",
      count: 2,
    })
  })

  it("always has a text label, never color alone", async () => {
    expect(describeSyncPill({ kind: "pending", count: 1 }).label).toBe(
      "1 change waiting to sync"
    )
    expect(describeSyncPill({ kind: "rejected", count: 2 }).label).toBe(
      "2 changes not saved"
    )
    expect(describeSyncPill({ kind: "conflict", count: 1 }).text).toBe(
      "1 conflict"
    )
    const onSelect = vi.fn()
    const { rerender } = render(
      <SyncPill state={{ kind: "synced" }} onSelect={onSelect} />
    )
    await userEvent.click(
      screen.getByRole("button", { name: "All changes synced" })
    )
    expect(onSelect).toHaveBeenCalled()
    rerender(<SyncPill state={{ kind: "syncing" }} onSelect={onSelect} />)
    expect(screen.getByRole("button", { name: "Syncing" })).toHaveTextContent(
      "Syncing…"
    )
    rerender(<SyncPill state={{ kind: "offline" }} onSelect={onSelect} />)
    expect(screen.getByRole("button", { name: "Offline" })).toBeInTheDocument()
  })
})

describe("update banners (pwa-offline §7.5, §8)", () => {
  it("Update ready offers Update Now and Later", async () => {
    const onUpdate = vi.fn()
    const onLater = vi.fn()
    render(
      <UpdateReadyBanner
        version="2.0.1"
        onUpdate={onUpdate}
        onLater={onLater}
      />
    )
    expect(
      screen.getByRole("status", { name: "Update ready" })
    ).toHaveTextContent("VScout 2.0.1 is downloaded.")
    await userEvent.click(screen.getByRole("button", { name: "Update Now" }))
    await userEvent.click(screen.getByRole("button", { name: "Later" }))
    expect(onUpdate).toHaveBeenCalled()
    expect(onLater).toHaveBeenCalled()
  })

  it("forced and other-window banners", async () => {
    render(<ForcedUpdateBanner copy="finish-form" />)
    expect(screen.getByText(/Finish this form/)).toBeInTheDocument()
    const onReload = vi.fn()
    render(<UpdatedElsewhereBanner onReload={onReload} />)
    await userEvent.click(screen.getByRole("button", { name: "Reload" }))
    expect(onReload).toHaveBeenCalled()
    render(
      <UpdateReadyBanner
        version={undefined}
        onUpdate={vi.fn()}
        onLater={vi.fn()}
      />
    )
    expect(screen.getByText("VScout update is downloaded.")).toBeInTheDocument()
  })
})

describe("full-page and placeholder messages", () => {
  it("render a heading, a sentence and actions", () => {
    render(
      <FullPageMessage
        icon={House}
        title="Page not found"
        description="This page doesn't exist."
      >
        <button type="button">Go Home</button>
      </FullPageMessage>
    )
    expect(
      screen.getByRole("heading", { name: "Page not found" })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Go Home" })).toBeInTheDocument()
    render(
      <FullPageMessage icon={House} title="Plain" description="No actions." />
    )
    render(<ComingSoon icon={House} title="Soon" description="Later build." />)
    expect(screen.getByRole("heading", { name: "Soon" })).toBeInTheDocument()
  })
})
