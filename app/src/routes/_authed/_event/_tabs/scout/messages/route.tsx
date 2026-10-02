import { Outlet, createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/lib/authorization"

// Chat and DMs: never for guests (ADR-066). Rendered as "You don't have access" (routing-auth §5.3).
export const Route = createFileRoute("/_authed/_event/_tabs/scout/messages")({
  beforeLoad: ({ context }) => {
    requirePermission(context.session, "message:read")
  },
  component: Outlet,
})
