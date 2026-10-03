import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { NotificationProducers } from "@/app/notification-producers"
import { UnsupportedSeasonError } from "@/components/errors/app-errors"

export const Route = createFileRoute("/_authed/_event")({
  // the active event lives on the device, not in the URL (ADR-021)
  beforeLoad: async ({ context, location }) => {
    const event = await context.app().loadActiveEvent()
    if (!event)
      throw redirect({
        to: "/onboarding",
        search: { redirect: location.href },
      })
    if (event.year !== context.game.year)
      throw new UnsupportedSeasonError(event.year)
    return { event }
  },
  component: EventLayout,
})

// In-app notifications are produced for the active event on every page, scouting forms included.
function EventLayout() {
  const { app, event } = Route.useRouteContext()
  return (
    <>
      <NotificationProducers app={app()} eventKey={event.key} />
      <Outlet />
    </>
  )
}
