import { createFileRoute } from "@tanstack/react-router"
import { TabRootActions } from "@/app/tab-root-actions"
import { UsersRound } from "@/components/icons/icon"
import { ComingSoon } from "@/components/layout/coming-soon"
import { StackPage } from "@/components/layout/stack-page"

export const Route = createFileRoute("/_authed/_event/_tabs/teams/")({
  component: TeamsTab,
})

function TeamsTab() {
  return (
    <StackPage title="Teams" trailing={<TabRootActions />}>
      <ComingSoon
        icon={UsersRound}
        title="Teams is on its way"
        description="Team rankings and details arrive in the next build."
      />
    </StackPage>
  )
}
