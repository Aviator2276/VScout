import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
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
  component: Outlet,
})
