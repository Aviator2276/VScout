import { createFileRoute } from "@tanstack/react-router"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { useStrategyMatches } from "@/features/strategy/api/get-briefing"
import { StrategyPickerView } from "@/features/strategy/components/briefing-view"
import { useOurTeam } from "@/hooks/use-our-team"

export const Route = createFileRoute("/_authed/_event/_tabs/scout/strategy/")({
  component: StrategyPicker,
})

function StrategyPicker() {
  const { event } = Route.useRouteContext()
  const ourTeam = useOurTeam()
  return (
    <StackPage
      title="Strategy"
      leading={<NavBackButton parentHref="/scout" label="Scout" />}
    >
      <StrategyPickerView
        state={useStrategyMatches(event.key)}
        ourTeam={ourTeam}
      />
    </StackPage>
  )
}
