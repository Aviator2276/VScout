import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { SessionRuntime } from "@/app/session-runtime"

export const Route = createFileRoute("/_authed")({
  // the cached Dexie session: no network when a row exists, so this works offline (routing-auth §5.1)
  beforeLoad: async ({ context, location }) => {
    const session = await context.app().auth.ensureLoaded()
    if (!session)
      throw redirect({ to: "/login", search: { redirect: location.href } })
    return { session }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const { app } = Route.useRouteContext()
  return (
    <SessionRuntime app={app()}>
      <Outlet />
    </SessionRuntime>
  )
}
