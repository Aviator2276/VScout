import { createFileRoute } from "@tanstack/react-router"
import { TabRootActions } from "@/app/tab-root-actions"
import { CalendarDays } from "@/components/icons/icon"
import { ComingSoon } from "@/components/layout/coming-soon"
import { StackPage } from "@/components/layout/stack-page"

export const Route = createFileRoute("/_authed/_event/_tabs/matches/")({
  component: MatchesTab,
})

function MatchesTab() {
  return (
    <StackPage title="Matches" trailing={<TabRootActions />}>
      <ComingSoon
        icon={CalendarDays}
        title="Matches is on its way"
        description="The match schedule and results arrive in the next build."
      />
    </StackPage>
  )
}
