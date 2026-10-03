import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useMemo, useState, useSyncExternalStore } from "react"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { useToast } from "@/components/overlays/toaster"
import {
  DemoDataView,
  randomSeed,
} from "@/features/admin/components/demo-data-view"
import { useEvents } from "@/features/events/api/use-events"
import { useOnline } from "@/hooks/use-online"
import { useAdminActions } from "@/lib/db/react/data-runtime"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/admin/demo"
)({
  component: DemoData,
})

// AD7a: shared demo events, made by the server (capabilities.demoSeed).
function DemoData() {
  const { event, app } = Route.useRouteContext()
  const runtime = app()
  const router = useRouter()
  const admin = useAdminActions()
  const online = useOnline()
  const toast = useToast()
  const [initialSeed] = useState(randomSeed)
  const caps = useSyncExternalStore(
    runtime.capabilities.subscribe,
    runtime.capabilities.get,
    runtime.capabilities.get
  )
  const events = useEvents()
  const demoEvents = useMemo(
    () =>
      events.status === "success"
        ? events.data
            .filter((e) => e.isDemo)
            .map((e) => ({ key: e.key, name: e.name }))
        : [],
    [events]
  )
  const open = (key: string) => {
    void (async () => {
      await runtime.setActiveEvent(key)
      await router.invalidate()
    })()
  }
  return (
    <StackPage
      title="Demo Data"
      leading={<NavBackButton parentHref="/settings/admin" label="Admin" />}
    >
      <DemoDataView
        available={caps.demoSeed}
        online={online}
        demoEvents={demoEvents}
        currentKey={event.key}
        initialSeed={initialSeed}
        onOpen={open}
        onCreate={async (options) => {
          const r = await admin.createDemoEvent(options)
          if (r.kind === "ok") {
            const key = r.created.eventKey
            toast.show({
              title: "Demo event ready",
              action: { label: "Open", onAction: () => open(key) },
            })
            return true
          }
          toast.show({
            title:
              r.kind === "offline"
                ? "You’re offline. Try again when you’re connected."
                : "Couldn’t create the demo event. Try again.",
          })
          return false
        }}
        onDelete={async (key) => {
          const r = await admin.deleteDemoEvent(key)
          toast.show({
            title:
              r.kind === "ok"
                ? "Demo event deleted"
                : "Couldn’t delete the demo event. Try again.",
          })
          return r.kind === "ok"
        }}
      />
    </StackPage>
  )
}
