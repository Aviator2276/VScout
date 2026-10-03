import { createFileRoute, redirect } from "@tanstack/react-router"

// Moved to the Messages tab (FX-14). Kept so old links and push notifications still land.
export const Route = createFileRoute(
  "/_authed/_event/_tabs/scout/announcements"
)({
  beforeLoad: () => {
    throw redirect({ to: "/messages/announcements", replace: true })
  },
})
