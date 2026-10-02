import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState, useSyncExternalStore } from "react"
import { z } from "zod"
import { usePushState } from "@/app/use-push-state"
import { formatAgo } from "@/components/sync/sync-badge"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { useToast } from "@/components/overlays/toaster"
import { useNow } from "@/hooks/use-now"
import { useOnline } from "@/hooks/use-online"
import { getKv } from "@/lib/db/kv"
import { useAdminActions } from "@/lib/db/react/data-runtime"
import { useLiveOr } from "@/lib/db/react/data-state-hooks"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/admin/push"
)({
  component: PushDiagnostics,
})

const STATE_LABEL = {
  subscribed: "Subscribed",
  "can-prompt": "Not turned on",
  snoozed: "Not turned on",
  "needs-tap": "Needs one more tap",
  denied: "Blocked in system settings",
  "needs-install": "Install to the Home Screen first",
  unsupported: "Not supported here",
} as const

const pushStats = z.looseObject({
  devices: z.record(z.string(), z.number()).optional(),
  failures24h: z.number().optional(),
  lastDeliveryAt: z.string().nullable().optional(),
})

function platformPath(): string {
  if (typeof navigator === "undefined") return "Unknown"
  const ua = navigator.userAgent
  if (/Android/.test(ua)) return "Android (Web Push)"
  const ios =
    /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  if (!ios) return "Desktop (Web Push)"
  return typeof window !== "undefined" && "pushManager" in window
    ? "iOS 18.4+ (declarative)"
    : "iOS 16.4–18.3 (service worker)"
}

// AD9: this device, the team (when the server reports it), and the push capabilities.
function PushDiagnostics() {
  const { app } = Route.useRouteContext()
  const runtime = app()
  const state = usePushState(runtime)
  const caps = useSyncExternalStore(
    runtime.capabilities.subscribe,
    runtime.capabilities.get,
    runtime.capabilities.get
  )
  const online = useOnline()
  const toast = useToast()
  const now = useNow()
  const admin = useAdminActions()
  const lastPut = useLiveOr(
    () => getKv(runtime.db, "pushLastPut"),
    [],
    undefined
  )
  const [stats, setStats] = useState<
    z.infer<typeof pushStats> | "missing" | null
  >(null)
  useEffect(() => {
    if (!online) return
    let live = true
    void admin.fetchOptional("/admin/push/stats", pushStats).then((r) => {
      if (live) setStats(r.kind === "ok" ? r.value : "missing")
    })
    return () => {
      live = false
    }
  }, [admin, online])
  return (
    <StackPage
      title="Push Notifications"
      leading={<NavBackButton parentHref="/settings/admin" label="Admin" />}
    >
      <List.Section title="This device">
        <List.Row title="State" detail={STATE_LABEL[state]} />
        <List.Row title="Platform" detail={platformPath()} />
        <List.Row
          title="Permission"
          detail={
            typeof Notification === "undefined"
              ? "Not available"
              : Notification.permission
          }
        />
        <List.Row
          title="Last registered"
          detail={lastPut ? formatAgo(now - lastPut.at) : "Never"}
        />
        {state === "subscribed" ? (
          <List.Row
            title="Send Test Notification"
            {...(online
              ? {
                  onSelect: () =>
                    void runtime.push
                      .test()
                      .then((n) =>
                        toast.show({
                          title:
                            n === null
                              ? "Test sent"
                              : `Sent to ${n} ${n === 1 ? "device" : "devices"}`,
                        })
                      )
                      .catch(() =>
                        toast.show({
                          title: "Couldn’t send a test. Check your connection.",
                        })
                      ),
                }
              : { detail: "Needs connection" })}
          />
        ) : (
          <List.Row
            title="Turn On"
            subtitle="This device isn’t getting notifications"
            href="/settings/notifications"
          />
        )}
      </List.Section>
      {stats !== null && stats !== "missing" ? (
        <List.Section title="Team">
          {Object.entries(stats.devices ?? {}).map(([platform, n]) => (
            <List.Row key={platform} title={platform} detail={String(n)} />
          ))}
          <List.Row
            title="Failures in the last 24 h"
            detail={String(stats.failures24h ?? 0)}
          />
          <List.Row
            title="Last delivery"
            detail={
              stats.lastDeliveryAt
                ? formatAgo(now - Date.parse(stats.lastDeliveryAt))
                : "None yet"
            }
          />
        </List.Section>
      ) : null}
      <List.Section title="Server features">
        <List.Row
          title="Badges (read markers)"
          detail={caps.readMarkers ? "On" : "Off"}
        />
        <List.Row
          title="Match coming up"
          detail={caps.matchPush ? "On" : "Off"}
        />
      </List.Section>
    </StackPage>
  )
}
