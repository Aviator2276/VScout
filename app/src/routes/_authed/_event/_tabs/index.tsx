import { createFileRoute } from "@tanstack/react-router"
import { TabRootActions } from "@/app/tab-root-actions"
import { House } from "@/components/icons/icon"
import { ComingSoon } from "@/components/layout/coming-soon"
import { StackPage } from "@/components/layout/stack-page"

export const Route = createFileRoute("/_authed/_event/_tabs/")({
  component: Home,
})

// Home widgets (features/home.md) arrive in Phase 6.
function Home() {
  const { event } = Route.useRouteContext()
  return (
    <StackPage title="Home" trailing={<TabRootActions profile />}>
      <p className="text-subhead text-muted-foreground">{event.name}</p>
      <ComingSoon
        icon={House}
        title="Your Home is on its way"
        description="Widgets for your next match, watched teams and announcements arrive in a later build."
      />
    </StackPage>
  )
}
