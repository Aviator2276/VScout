import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { z } from "zod"
import { useUpdateState } from "@/app/update-runtime"
import { Button } from "@/components/controls/button"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { ConfirmAlert } from "@/components/overlays/confirm-alert"
import { Sheet } from "@/components/overlays/sheet"
import { formatAgo } from "@/components/sync/sync-badge"
import { APP_COMMIT, APP_VERSION } from "@/config/version"
import { useSyncSummary } from "@/features/sync-status/api/use-sync-summary"
import {
  useDeviceSettings,
  useSetDeviceSettings,
} from "@/hooks/use-device-settings"
import { useNow } from "@/hooks/use-now"
import { useOnline } from "@/hooks/use-online"
import {
  clearEverything,
  isEmpty,
  summaryLines,
  unsyncedSummary,
} from "@/lib/pwa/clear-cache"
import type { UnsyncedSummary } from "@/lib/pwa/clear-cache"
import type { UpdateState } from "@/lib/pwa/update-controller"

export const Route = createFileRoute("/_authed/_event/_tabs/settings/storage")({
  validateSearch: z.object({
    sheet: z.enum(["clear-cache"]).optional().catch(undefined),
  }),
  component: Storage,
})

const TRANSPORTS = [
  { value: "auto", label: "Automatic" },
  { value: "http-only", label: "HTTP Only" },
  { value: "prefer-mqtt", label: "Prefer MQTT" },
] as const

const mb = (bytes: number) =>
  bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : `${Math.max(0.1, bytes / 1e6).toFixed(1)} MB`

type Estimate =
  { usage: number; quota: number; persisted: boolean } | "unavailable"

// navigator.storage is missing in old Safari and insecure contexts
const storageApi = (): StorageManager | undefined =>
  (navigator as { storage?: StorageManager }).storage

function useStorageEstimate() {
  const [value, setValue] = useState<Estimate | null>(() =>
    storageApi() ? null : "unavailable"
  )
  useEffect(() => {
    let live = true
    const s = storageApi()
    if (!s) return
    void Promise.all([s.estimate(), s.persisted()])
      .then(([e, persisted]) => {
        if (live)
          setValue({ usage: e.usage ?? 0, quota: e.quota ?? 0, persisted })
      })
      .catch(() => {
        if (live) setValue("unavailable")
      })
    return () => {
      live = false
    }
  }, [])
  return value
}

function checkCopy(s: UpdateState, now: number): string {
  switch (s.status) {
    case "checking":
      return "Checking…"
    case "downloading":
      return s.available
        ? `Downloading version ${s.available}…`
        : "Downloading…"
    case "error":
      return "Couldn't check for updates. Try again."
    case "unsupported":
      return import.meta.env.DEV
        ? "Not available in development builds"
        : "Not supported in this browser"
    case "ready":
    case "applying":
      return `Version ${s.available ?? ""} is ready.`
    case "idle":
      return s.lastCheckedAt
        ? `Last checked ${formatAgo(now - s.lastCheckedAt)}`
        : "VScout is up to date."
  }
}

// Settings → Storage & Diagnostics (features/settings.md, settings-storage.md). Guests see it too:
// these are device actions, not data writes.
function Storage() {
  const { app } = Route.useRouteContext()
  const runtime = app()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const online = useOnline()
  const now = useNow()
  const sync = useSyncSummary()
  const { controller, state } = useUpdateState()
  const estimate = useStorageEstimate()
  const device = useDeviceSettings()
  const setDevice = useSetDeviceSettings()
  const [forceAsk, setForceAsk] = useState(false)
  const [clearAsk, setClearAsk] = useState(false)
  const [deleteAsk, setDeleteAsk] = useState(false)
  const [summary, setSummary] = useState<UnsyncedSummary | null>(null)
  const [clearing, setClearing] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [blockedElsewhere, setBlockedElsewhere] = useState(false)
  const needs = online ? undefined : "Needs connection"

  // ?sheet=clear-cache reopens the guard after a reload (deep link), with fresh counts
  useEffect(() => {
    if (search.sheet !== "clear-cache") return
    let live = true
    void unsyncedSummary(runtime.db).then((s) => {
      if (live) setSummary(s)
    })
    return () => {
      live = false
    }
  }, [search.sheet, runtime.db])

  const setSheet = (sheet: "clear-cache" | undefined) =>
    void navigate({ search: { sheet }, replace: sheet === undefined })

  const startClear = async () => {
    const s = await unsyncedSummary(runtime.db)
    if (isEmpty(s)) setClearAsk(true)
    else {
      setSummary(s)
      setSheet("clear-cache")
    }
  }

  const clear = async () => {
    setClearAsk(false)
    setDeleteAsk(false)
    setSheet(undefined)
    setClearing(true)
    try {
      const deviceId = await runtime.deviceId()
      await clearEverything({
        db: runtime.db,
        deviceId,
        quiesce: runtime.quiesce,
        reload: () => window.location.replace("/"),
      })
    } catch {
      setClearing(false)
      setFailed("Close other VScout windows and try again.")
      if (!runtime.db.isOpen()) await runtime.db.open()
    }
  }

  const exportDiagnostics = async () => {
    const db = runtime.db
    const [ops, logs] = await Promise.all([
      db.outbox.toArray(),
      db.logs.orderBy("at").reverse().limit(300).toArray(),
    ])
    const outbox: Record<string, number> = {}
    for (const op of ops)
      outbox[`${op.entity}:${op.state}`] =
        (outbox[`${op.entity}:${op.state}`] ?? 0) + 1
    const report = {
      app: {
        version: APP_VERSION,
        commit: APP_COMMIT,
        userAgent: navigator.userAgent,
      },
      exportedAt: new Date().toISOString(),
      transportMode: device.transport,
      transports: runtime.transportHealth(),
      sync: { ...sync },
      update: state,
      outbox,
      logs,
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
    )
    const a = document.createElement("a")
    a.href = url
    a.download = `vscout-diagnostics-${Date.now()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const ready = state.status === "ready" || state.status === "applying"
  // the dev server never registers the service worker: say so instead of "Downloading…" forever
  const offlineReady = import.meta.env.DEV
    ? "Not available in development builds"
    : state.status === "unsupported"
      ? "Not supported in this browser"
      : state.offlineReady
        ? "Yes"
        : online
          ? "Downloading…"
          : "No"

  return (
    <StackPage
      title="Storage & Diagnostics"
      leading={<NavBackButton parentHref="/settings" label="Settings" />}
    >
      <List.Section title="Sync">
        <List.Row
          title="Status"
          subtitle={
            sync.lastSuccessAt
              ? `Last synced ${formatAgo(now - sync.lastSuccessAt)}`
              : "Not synced yet"
          }
          detail={
            !sync.online
              ? "Offline"
              : sync.syncing
                ? "Syncing…"
                : sync.pending > 0
                  ? `${sync.pending} waiting`
                  : "Up to date"
          }
        />
        <List.Row
          title="Sync Now"
          {...(online
            ? { onSelect: () => runtime.sync.requestSync("manual") }
            : { detail: "Needs connection" })}
        />
      </List.Section>

      <List.Section
        title="Updates"
        footer="Force Update reloads VScout and downloads the latest version. Your data stays on this device."
      >
        <List.Row
          title="Version"
          subtitle={`Build ${APP_COMMIT}`}
          detail={APP_VERSION}
        />
        <List.Row
          title="Offline Ready"
          detail={offlineReady}
          {...(offlineReady === "No"
            ? { subtitle: "Open VScout online once to finish downloading." }
            : {})}
        />
        {ready ? (
          <List.Row
            title="Update Now"
            subtitle={
              blockedElsewhere
                ? "Finish scouting in your other VScout window first."
                : `Version ${state.available ?? ""} is ready.`
            }
            onSelect={() => {
              if (controller && !controller.apply()) setBlockedElsewhere(true)
            }}
          />
        ) : (
          <List.Row
            title="Check for Updates"
            subtitle={checkCopy(state, now)}
            {...(needs || !controller || state.status === "checking"
              ? { detail: needs }
              : { onSelect: () => void controller.check("manual") })}
          />
        )}
        <List.Row
          title="Force Update"
          {...(needs
            ? { detail: needs }
            : { onSelect: () => setForceAsk(true) })}
        />
      </List.Section>

      <List.Section title="Storage">
        <List.Row
          title="Storage used"
          detail={
            estimate === null
              ? "Measuring…"
              : estimate === "unavailable"
                ? "Not available"
                : `${mb(estimate.usage)} of ${mb(estimate.quota)}`
          }
          {...(estimate === "unavailable"
            ? { subtitle: "Storage info isn't available in this browser" }
            : {})}
        />
        {estimate !== null && estimate !== "unavailable" ? (
          <List.Row
            title="Keep data on this device"
            detail={estimate.persisted ? "On" : "Off"}
            {...(estimate.persisted
              ? {}
              : {
                  subtitle:
                    "The browser may delete VScout's data if space runs low.",
                  onSelect: () => void navigator.storage.persist(),
                })}
          />
        ) : null}
        <List.Row title="Downloaded Videos" href="/matches/videos" />
      </List.Section>

      <List.Section
        title="Connection"
        footer="Leave on Automatic unless an admin asks you to change it."
      >
        {TRANSPORTS.map((t) => (
          <List.Row
            key={t.value}
            title={t.label}
            detail={device.transport === t.value ? "✓" : undefined}
            onSelect={() => void setDevice({ transport: t.value })}
          />
        ))}
      </List.Section>
      <List.Section>
        <List.Row
          title="Export Diagnostics"
          subtitle="App version, sync queue and recent errors. No passwords or tokens."
          onSelect={() => void exportDiagnostics()}
        />
      </List.Section>

      <List.Section
        title="Reset"
        footer="Deletes everything VScout stored on this device, including downloaded videos, then downloads it again. You stay signed in."
      >
        <List.Row
          title={
            <span className="text-destructive">
              Clear Cache and Re-download
            </span>
          }
          {...(needs
            ? { detail: needs }
            : { onSelect: () => void startClear() })}
        />
      </List.Section>

      <ConfirmAlert
        open={forceAsk}
        onOpenChange={setForceAsk}
        title="Force Update?"
        description="VScout will reload and download the latest version. Unsynced changes and drafts stay on this device."
        confirmLabel="Force Update"
        onConfirm={() => {
          void navigator.serviceWorker
            .getRegistration()
            .then((r) => r?.update())
            .finally(() => window.location.reload())
        }}
      />
      <ConfirmAlert
        open={clearAsk}
        onOpenChange={setClearAsk}
        title="Clear Cache and Re-download?"
        description="VScout will delete its offline data, downloaded videos and the settings stored on this device, then reload and download everything again. You'll stay signed in. This needs a good connection and can take a minute."
        confirmLabel="Clear and Re-download"
        tone="destructive"
        onConfirm={() => void clear()}
      />
      <Sheet
        open={search.sheet === "clear-cache"}
        onOpenChange={(o) => (o ? undefined : setSheet(undefined))}
      >
        <Sheet.Content title="Unsynced Work on This Device">
          <p className="text-body">
            Clearing the cache deletes work that hasn’t reached the server:
          </p>
          <ul className="my-3 list-disc pl-6 text-body">
            {summary
              ? summaryLines(summary).map((l) => <li key={l}>{l}</li>)
              : null}
          </ul>
          <div className="flex flex-col gap-2">
            <Button
              size="large"
              disabled={!online}
              onClick={() => runtime.sync.requestSync("manual")}
            >
              {online ? "Sync Now" : "You’re offline"}
            </Button>
            <Button
              size="large"
              variant="secondary"
              onClick={() => void exportDiagnostics()}
            >
              Export Unsynced Data
            </Button>
            <Button
              size="large"
              variant="destructive"
              onClick={() => setDeleteAsk(true)}
            >
              Delete Anyway
            </Button>
            <Button
              size="large"
              variant="plain"
              onClick={() => setSheet(undefined)}
            >
              Cancel
            </Button>
          </div>
        </Sheet.Content>
      </Sheet>
      <ConfirmAlert
        open={deleteAsk}
        onOpenChange={setDeleteAsk}
        title="Delete Unsynced Work?"
        description={`${summary ? summaryLines(summary).join(", ") : "Your unsynced work"} will be deleted. This can't be undone.`}
        confirmLabel="Delete and Clear"
        tone="destructive"
        onConfirm={() => void clear()}
      />
      <ConfirmAlert
        open={failed !== null}
        onOpenChange={() => setFailed(null)}
        title="Couldn't Clear the Cache"
        description={failed ?? ""}
        confirmLabel="OK"
        onConfirm={() => setFailed(null)}
      />
      {clearing ? (
        <div
          role="status"
          className="text-title3 fixed inset-0 z-50 flex items-center justify-center bg-background/90"
        >
          Clearing VScout…
        </div>
      ) : null}
    </StackPage>
  )
}
