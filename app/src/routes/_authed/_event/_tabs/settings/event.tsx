import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState, useSyncExternalStore } from "react"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { EventPicker } from "@/features/events/components/event-picker"
import { localDate } from "@/features/events/utils/event-dates"

export const Route = createFileRoute("/_authed/_event/_tabs/settings/event")({
  component: EventSettings,
})

function EventSettings() {
  const { app, session } = Route.useRouteContext()
  const runtime = app()
  const router = useRouter()
  const [today] = useState(() => localDate(Date.now()))
  const selected = useSyncExternalStore(
    runtime.activeEventKey.subscribe,
    runtime.activeEventKey.getSnapshot,
    runtime.activeEventKey.getSnapshot
  )
  return (
    <StackPage
      title="Event"
      leading={<NavBackButton parentHref="/settings" label="Settings" />}
    >
      <EventPicker
        selectedKey={selected}
        today={today}
        onlyKey={session.eventKey}
        onPick={(key) => {
          void (async () => {
            await runtime.setActiveEvent(key)
            await router.invalidate()
          })()
        }}
      />
    </StackPage>
  )
}
