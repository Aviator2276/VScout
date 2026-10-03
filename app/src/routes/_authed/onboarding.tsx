import { createFileRoute } from "@tanstack/react-router"
import { useState, useSyncExternalStore } from "react"
import { z } from "zod"
import { StackPage } from "@/components/layout/stack-page"
import { EventPicker } from "@/features/events/components/event-picker"
import { localDate } from "@/features/events/utils/event-dates"
import { safeRedirect } from "@/utils/safe-redirect"

const onboardingSearch = z.object({
  redirect: z
    .string()
    .optional()
    .transform((v) => (v ? safeRedirect(v) : undefined))
    .catch(undefined),
})

export const Route = createFileRoute("/_authed/onboarding")({
  validateSearch: onboardingSearch,
  component: Onboarding,
})

function Onboarding() {
  const { app, session } = Route.useRouteContext()
  const runtime = app()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [today] = useState(() => localDate(Date.now()))
  const selected = useSyncExternalStore(
    runtime.activeEventKey.subscribe,
    runtime.activeEventKey.getSnapshot,
    runtime.activeEventKey.getSnapshot
  )
  return (
    <StackPage title="Choose an Event">
      <p className="mb-4 text-subhead text-muted-foreground">
        Pick the event you're scouting. You can switch later in Settings.
      </p>
      <EventPicker
        selectedKey={selected}
        today={today}
        onlyKey={session.eventKey}
        onPick={(key) => {
          void (async () => {
            await runtime.setActiveEvent(key)
            await navigate({ href: safeRedirect(search.redirect) })
          })()
        }}
      />
    </StackPage>
  )
}
