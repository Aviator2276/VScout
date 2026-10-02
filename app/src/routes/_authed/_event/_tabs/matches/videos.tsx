import { createFileRoute } from "@tanstack/react-router"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { VideosView } from "@/features/matches/components/videos-view"
import { useOnline } from "@/hooks/use-online"

export const Route = createFileRoute("/_authed/_event/_tabs/matches/videos")({
  component: Videos,
})

// Downloaded Videos (features/matches.md M3), also reached from Settings → Storage.
function Videos() {
  const { event } = Route.useRouteContext()
  const online = useOnline()
  return (
    <StackPage
      title="Downloaded Videos"
      leading={<NavBackButton parentHref="/matches" label="Matches" />}
    >
      <VideosView eventKey={event.key} online={online} />
    </StackPage>
  )
}
