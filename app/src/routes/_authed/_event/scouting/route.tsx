import { Outlet, createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/lib/authorization"

// Full-screen scouting flows, outside the tab bar (routing-auth §2.3). Guests can never scout: the
// route error shows "You don't have access" instead of a silent redirect (routing-auth §5.3).
export const Route = createFileRoute("/_authed/_event/scouting")({
  beforeLoad: ({ context }) => {
    requirePermission(context.session, "scouting:create")
  },
  component: Outlet,
})
