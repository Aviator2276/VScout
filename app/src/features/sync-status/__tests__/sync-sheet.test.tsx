// The notch and the Sync sheet together (features/sync-status.md S1, S3).
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ToastProvider } from "@/components/overlays/toaster"
import { DataRuntimeContext } from "@/lib/db/react/data-runtime"
import { createStore } from "@/lib/mqtt/external-store"
import { createNetworkTelemetry } from "@/lib/network/network-telemetry"
import type { SyncStatus } from "@/lib/sync/status-store"
import { createTestRuntime } from "@/testing/data-runtime"
import { SyncNotch } from "../components/sync-notch"
import { SyncSheet } from "../components/sync-sheet"
import { syncSheetStore } from "../stores/sync-sheet"

afterEach(() => syncSheetStore.set(false))

function setup() {
  const t = createTestRuntime()
  const network = createNetworkTelemetry(() => Date.now())
  const onNavigate = vi.fn()
  render(
    <App theme="ios">
      <ToastProvider>
        <DataRuntimeContext value={{ ...t.runtime, network }}>
          <SyncNotch attached={false} />
          <SyncSheet onNavigate={onNavigate} />
        </DataRuntimeContext>
      </ToastProvider>
    </App>
  )
  return { t, network, onNavigate }
}

describe("Sync Status", () => {
  it("the notch names its state, and follows the telemetry", () => {
    const { network } = setup()
    const notch = screen.getByRole("button", { name: /^Sync status/ })
    expect(notch).toHaveAccessibleName("Sync status: connecting")
    act(() => {
      network.ping(60)
      network.begin({ dir: "down", via: "http", label: "Changes" })({
        ok: true,
        bytesOut: 0,
        bytesIn: 10,
        reached: true,
      })
    })
    expect(notch).toHaveAccessibleName("Sync status: connected, strong signal")
    act(() => {
      network.begin({ dir: "up", via: "http", label: "Save comments" })
    })
    expect(notch).toHaveAccessibleName(
      "Sync status: connected, strong signal, uploading"
    )
  })

  it("the notch opens the sheet: status, tiles, chart, recent transfers", async () => {
    const { network } = setup()
    act(() => {
      network.begin({ dir: "down", via: "http", label: "Changes" })({
        ok: true,
        bytesOut: 0,
        bytesIn: 2_000,
        reached: true,
      })
    })
    await userEvent.click(screen.getByRole("button", { name: /^Sync status/ }))
    const sheet = await screen.findByRole("dialog", { name: "Sync" })
    expect(sheet).toHaveTextContent("Connected")
    expect(sheet).toHaveTextContent("Ping")
    expect(sheet).toHaveTextContent("Collecting history…")
    expect(sheet).toHaveTextContent("Recent")
    expect(sheet).toHaveTextContent("Changes")
    expect(screen.getByRole("button", { name: "Sync Now" })).toBeEnabled()
  })

  it("waiting changes: tap for Retry Now and Discard on a new record (criterion 9)", async () => {
    const { t } = setup()
    await act(async () => {
      await t.writer.db.transaction("rw", t.writer.db.outbox, async () => {
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
    })
    act(() => syncSheetStore.set(true))
    const row = await screen.findByRole("button", { name: /Note/ })
    expect(screen.getByText("Waiting to Upload")).toBeInTheDocument()
    await userEvent.click(row)
    expect(
      await screen.findByRole("button", { name: "Retry Now" })
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Discard" }))
    await waitFor(async () => expect(await t.writer.db.outbox.count()).toBe(0))
  })

  it("sign-in needed is listed first and navigates", async () => {
    const t = createTestRuntime()
    const onNavigate = vi.fn()
    const syncStatus = createStore<SyncStatus>({
      phase: "paused-auth",
      leaderTab: true,
    })
    render(
      <App theme="ios">
        <ToastProvider>
          <DataRuntimeContext value={{ ...t.runtime, syncStatus }}>
            <SyncNotch attached />
            <SyncSheet onNavigate={onNavigate} />
          </DataRuntimeContext>
        </ToastProvider>
      </App>
    )
    expect(
      screen.getByRole("button", { name: /^Sync status/ })
    ).toHaveAccessibleName(/1 change needs attention/)
    act(() => syncSheetStore.set(true))
    const sheet = await screen.findByRole("dialog", { name: "Sync" })
    expect(sheet).toHaveTextContent("Needs Attention")
    await userEvent.click(
      screen.getByRole("button", { name: /Sign in to keep syncing/ })
    )
    expect(onNavigate).toHaveBeenCalledWith("/login?reauth=true")
    expect(syncSheetStore.getSnapshot()).toBe(false)
  })
})
