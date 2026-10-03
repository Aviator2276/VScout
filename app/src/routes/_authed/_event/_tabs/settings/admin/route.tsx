import { Outlet, createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/lib/authorization"

// Settings → Admin (ADR-065, features/admin.md): admins only. Scouters and guests who deep-link here
// get "You don't have access" (routing-auth §5.3), and no admin data is read.
export const Route = createFileRoute("/_authed/_event/_tabs/settings/admin")({
  beforeLoad: ({ context }) => {
    requirePermission(context.session, "admin:access")
  },
  component: Outlet,
})
