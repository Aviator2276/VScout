import { createFileRoute } from "@tanstack/react-router"
import { useSyncExternalStore } from "react"
import { DataView } from "@/components/data-view/data-view"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { useToast } from "@/components/overlays/toaster"
import { formatAgo } from "@/components/sync/sync-badge"
import { useEventSettings } from "@/features/admin/api/get-admin"
import { GuestAccessView } from "@/features/admin/components/guest-access-view"
import { useNow } from "@/hooks/use-now"
import { useOnline } from "@/hooks/use-online"
import { useAdminActions } from "@/lib/db/react/data-runtime"
import type { EventSettingsRecord } from "@/lib/db/types"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/admin/guest-access"
)({
  component: GuestAccess,
})

function GuestAccess() {
  const { event, app } = Route.useRouteContext()
  const runtime = app()
  const settings = useEventSettings(event.key)
  const admin = useAdminActions()
  const online = useOnline()
  const toast = useToast()
  const now = useNow()
  const caps = useSyncExternalStore(
    runtime.capabilities.subscribe,
    runtime.capabilities.get,
    runtime.capabilities.get
  )
  const canShare = typeof navigator !== "undefined" && "share" in navigator
  // never created yet: guest access is off by default (ADR-073)
  const state =
    settings.status === "missing"
      ? ({
          status: "success",
          data: {
            id: event.key,
            eventKey: event.key,
            rev: 0,
            updatedAt: 0,
            scoutingOpen: true,
            guestAccess: { enabled: false, code: null, rotatedAt: null },
            syncState: "synced",
          } satisfies EventSettingsRecord,
        } as const)
      : settings
  return (
    <StackPage
      title="Guest Access"
      leading={<NavBackButton parentHref="/settings/admin" label="Admin" />}
    >
      <DataView state={state} size="page">
        <DataView.Error title="Couldn’t load guest access." />
        <DataView.Success>
          {(s: EventSettingsRecord) => (
            <GuestAccessView
              settings={s}
              online={online}
              supported={caps.guestLogin}
              relative={(at) => formatAgo(now - at)}
              onSave={async (next) => {
                const r = await admin.saveGuestAccess(event.key, next)
                return { ok: r.kind === "ok" }
              }}
              onCopy={(code) => {
                void navigator.clipboard
                  .writeText(code)
                  .then(() => toast.show({ title: "Code copied" }))
              }}
              {...(canShare
                ? {
                    onShare: (code: string) =>
                      void navigator
                        .share({
                          text: `Join VScout as a guest: ${window.location.origin}, code ${code}`,
                        })
                        .catch(() => undefined),
                  }
                : {})}
            />
          )}
        </DataView.Success>
      </DataView>
    </StackPage>
  )
}
