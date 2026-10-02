import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState, useSyncExternalStore } from "react"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { formatAgo } from "@/components/sync/sync-badge"
import { useUserNames } from "@/features/admin/api/get-admin"
import { useDeviceSettings } from "@/hooks/use-device-settings"
import { useNow } from "@/hooks/use-now"
import { useOnline } from "@/hooks/use-online"
import { useAdminActions } from "@/lib/db/react/data-runtime"
import { syncHealth } from "@/lib/sync/admin-actions"
import type { SyncHealth as ServerHealth } from "@/lib/sync/admin-actions"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/admin/sync-health"
)({
  component: SyncHealth,
})

const MODE = {
  auto: "Automatic",
  "http-only": "HTTP only",
  "prefer-mqtt": "Prefer MQTT",
} as const

// AD10: who's online (MQTT presence), what the server knows per device (optional endpoint), and this
// device's transports. For triaging venue network problems.
function SyncHealth() {
  const { app, event } = Route.useRouteContext()
  const runtime = app()
  const online = useOnline()
  const now = useNow(15_000)
  const names = useUserNames()
  const admin = useAdminActions()
  const device = useDeviceSettings()
  const presence = useSyncExternalStore(
    runtime.presence.subscribe,
    runtime.presence.getSnapshot,
    () => new Map()
  )
  const mqtt = useSyncExternalStore(
    runtime.mqttStatus.subscribe,
    runtime.mqttStatus.getSnapshot,
    () => null
  )
  const [server, setServer] = useState<
    ServerHealth | "missing" | "error" | null
  >(null)
  useEffect(() => {
    if (!online) return
    let live = true
    void admin
      .fetchOptional(`/events/${event.key}/admin/sync-health`, syncHealth)
      .then((r) => {
        if (live)
          setServer(
            r.kind === "ok"
              ? r.value
              : r.kind === "missing"
                ? "missing"
                : "error"
          )
      })
    return () => {
      live = false
    }
  }, [admin, online, event.key])
  const health = runtime.transportHealth()
  const here = [...presence.values()].filter((p) => p.status !== "offline")
  return (
    <StackPage
      title="Sync Health"
      leading={<NavBackButton parentHref="/settings/admin" label="Admin" />}
    >
      <List.Section
        title="Online now"
        footer={
          server === "missing" ? "More detail needs server support." : undefined
        }
      >
        {!online ? (
          <List.Row title="Connect to see who’s online" />
        ) : !mqtt ? (
          <List.Row title="Live connection not ready" />
        ) : here.length === 0 ? (
          <List.Row title="No one else is online" />
        ) : (
          here.map((p) => (
            <List.Row
              key={`${p.userId}:${p.deviceId}`}
              title={names.get(p.userId) ?? "Unknown"}
              subtitle={
                [
                  p.appVersion ? `v${p.appVersion}` : null,
                  p.status === "away" ? "Away" : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              detail={formatAgo(now - p.at)}
            />
          ))
        )}
      </List.Section>
      {server !== null && server !== "missing" && server !== "error" ? (
        <List.Section
          title="Devices (server)"
          footer={
            server.guestSessions === undefined
              ? undefined
              : `${server.guestSessions} guest sessions`
          }
        >
          {server.devices.map((d) => (
            <List.Row
              key={d.deviceId}
              title={names.get(d.userId) ?? d.userId}
              subtitle={
                [
                  d.appVersion ? `v${d.appVersion}` : null,
                  d.lastTransport
                    ? d.lastTransport === "mqtt"
                      ? "MQTT RPC"
                      : "HTTP"
                    : null,
                  d.rejectedOps24h ? `${d.rejectedOps24h} rejected` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              detail={formatAgo(now - Date.parse(d.lastSeenAt))}
            />
          ))}
        </List.Section>
      ) : server === "error" ? (
        <p className="px-4 text-footnote text-destructive">
          Couldn’t load device details.
        </p>
      ) : null}
      <List.Section title="This device">
        <List.Row title="Connection setting" detail={MODE[device.transport]} />
        <List.Row
          title="Live connection"
          detail={mqtt ? "Connected" : "Not connected"}
        />
        {(["http", "mqtt"] as const).map((t) => {
          const h = health[t]
          return (
            <List.Row
              key={t}
              title={t === "http" ? "HTTP" : "MQTT RPC"}
              subtitle={
                h.ewmaLatencyMs === null
                  ? "No requests yet"
                  : `~${Math.round(h.ewmaLatencyMs)} ms`
              }
              detail={
                h.consecutiveFailures > 0
                  ? `${h.consecutiveFailures} failures`
                  : "OK"
              }
            />
          )
        })}
      </List.Section>
    </StackPage>
  )
}
