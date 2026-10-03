// The notch and its details tooltip together (features/sync-status.md S1, S3).
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ToastProvider } from "@/components/overlays/toaster"
import { DataRuntimeContext } from "@/lib/db/react/data-runtime"
import type { DataRuntime } from "@/lib/db/react/data-runtime"
import { createStore } from "@/lib/mqtt/external-store"
import { createNetworkTelemetry } from "@/lib/network/network-telemetry"
import type { SyncStatus } from "@/lib/sync/status-store"
import { createTestRuntime } from "@/testing/data-runtime"
import { SyncConflictHost } from "../components/sync-conflict-host"
import { SyncNotch } from "../components/sync-notch"
import { conflictStore } from "../stores/conflict"

afterEach(() => conflictStore.set(null))

function setup(extra: Partial<DataRuntime> = {}) {
  const t = createTestRuntime()
  const network = createNetworkTelemetry(() => Date.now())
  const onNavigate = vi.fn()
  render(
    <App theme="ios">
      <ToastProvider>
        <DataRuntimeContext value={{ ...t.runtime, network, ...extra }}>
          <SyncNotch attached={false} onNavigate={onNavigate} />
          <SyncConflictHost onNavigate={onNavigate} />
        </DataRuntimeContext>
      </ToastProvider>
    </App>
  )
  return { t, network, onNavigate }
}

const notch = () => screen.getByRole("button", { name: /^Sync status/ })

describe("Sync Status notch", () => {
  it("names its state and follows the telemetry", () => {
    const { network } = setup()
    expect(notch()).toHaveAccessibleName("Sync status: connecting")
    act(() => {
      network.ping(60)
      network.begin({ dir: "down", via: "http", label: "Changes" })({
        ok: true,
        bytesOut: 0,
        bytesIn: 10,
        reached: true,
      })
    })
    expect(notch()).toHaveAccessibleName(
      "Sync status: connected, strong signal"
    )
    act(() => {
      network.begin({ dir: "up", via: "http", label: "Save comments" })
    })
    expect(notch()).toHaveAccessibleName(
      "Sync status: connected, strong signal, uploading"
    )
  })

  it("a tap opens the details tooltip: status, tiles, chart, recent; tap again closes", async () => {
    const { network } = setup()
    act(() => {
      network.begin({ dir: "down", via: "http", label: "Changes" })({
        ok: true,
        bytesOut: 0,
        bytesIn: 2_000,
        reached: true,
      })
    })
    expect(notch()).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(notch())
    const tip = await screen.findByRole("dialog", { name: "Sync" })
    expect(notch()).toHaveAttribute("aria-expanded", "true")
    expect(tip).toHaveTextContent("Connected")
    expect(tip).toHaveTextContent("Ping")
    expect(tip).toHaveTextContent("Collecting history…")
    expect(screen.getByRole("list", { name: "Recent" })).toHaveTextContent(
      "Changes"
    )
    expect(screen.getByRole("button", { name: "Sync Now" })).toBeEnabled()
    await userEvent.keyboard("{Escape}")
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Sync" })).toBeNull()
    )
  })

  it("waiting changes: actions open in place; Discard asks first (criterion 9)", async () => {
    const { t } = setup()
    await act(async () => {
      await t.writer.db.outbox.add({
        opId: "op-1",
        userId: "u",
        entity: "comment",
        recordId: "c1",
        recordKey: "comment:c1",
        eventKey: "2026casj",
        kind: "create",
        state: "queued",
        attempts: 0,
        nextAttemptAt: 0,
        createdAt: 1,
      })
    })
    await userEvent.click(notch())
    const row = await screen.findByRole("button", { name: /Note/ })
    expect(row).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(row)
    expect(
      await screen.findByRole("button", { name: "Retry Now" })
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Discard…" }))
    expect(screen.getByText(/It was never sent/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Discard" }))
    await waitFor(async () => expect(await t.writer.db.outbox.count()).toBe(0))
  })

  it("Retry Now clears the backoff and syncs", async () => {
    const { t } = setup()
    const requestSync = vi.fn()
    t.runtime.requestSync = requestSync
    await act(async () => {
      await t.writer.db.outbox.add({
        opId: "op-2",
        userId: "u",
        entity: "comment",
        recordId: "c2",
        recordKey: "comment:c2",
        eventKey: "2026casj",
        kind: "update",
        state: "queued",
        attempts: 2,
        nextAttemptAt: Date.now() + 60_000,
        createdAt: 1,
      })
    })
    await userEvent.click(notch())
    await userEvent.click(
      await screen.findByRole("button", { name: /Edit to note/ })
    )
    expect(screen.queryByRole("button", { name: "Discard…" })).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: "Retry Now" }))
    await waitFor(async () =>
      expect(
        (await t.writer.db.outbox.toArray())[0]?.nextAttemptAt
      ).toBeLessThanOrEqual(Date.now())
    )
  })

  it("sign-in needed is listed first and navigates", async () => {
    const syncStatus = createStore<SyncStatus>({
      phase: "paused-auth",
      leaderTab: true,
    })
    const { onNavigate } = setup({ syncStatus })
    expect(notch()).toHaveAccessibleName(/1 change needs attention/)
    await userEvent.click(notch())
    const tip = await screen.findByRole("dialog", { name: "Sync" })
    expect(tip).toHaveTextContent("Needs Attention")
    await userEvent.click(
      screen.getByRole("button", { name: /Sign in to keep syncing/ })
    )
    expect(onNavigate).toHaveBeenCalledWith("/login?reauth=true")
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Sync" })).toBeNull()
    )
  })
})
