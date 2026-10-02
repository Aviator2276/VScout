import { createFileRoute } from "@tanstack/react-router"
import { TabRootActions } from "@/app/tab-root-actions"
import { ClipboardList } from "@/components/icons/icon"
import { ComingSoon } from "@/components/layout/coming-soon"
import { StackPage } from "@/components/layout/stack-page"

export const Route = createFileRoute("/_authed/_event/_tabs/scout/")({
  component: ScoutTab,
})

function ScoutTab() {
  return (
    <StackPage title="Scout" trailing={<TabRootActions />}>
      <ComingSoon
        icon={ClipboardList}
        title="Scout is on its way"
        description="Scouting, picklists and strategy arrive in a later build."
      />
    </StackPage>
  )
}
