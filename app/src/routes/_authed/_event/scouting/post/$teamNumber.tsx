import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { ScoutingPage, useScoutingFinish } from "@/app/scouting-chrome"
import { activeGame } from "@/config/game"
import { useScoutingSettings } from "@/features/scouting/api/get-scout-target"
import { TeamScouting } from "@/features/scouting/components/team-scouting"
import { useOnline } from "@/hooks/use-online"

export const Route = createFileRoute(
  "/_authed/_event/scouting/post/$teamNumber"
)({
  validateSearch: z.object({
    stage: z.string().max(40).optional().catch(undefined),
  }),
  component: PostScoutingRoute,
})

function PostScoutingRoute() {
  const { teamNumber } = Route.useParams()
  const { event, session } = Route.useRouteContext()
  const { stage } = Route.useSearch()
  const navigate = Route.useNavigate()
  const online = useOnline()
  const settings = useScoutingSettings(event.key)
  const parent = `/teams/${teamNumber}`
  const finish = useScoutingFinish(parent)
  return (
    <ScoutingPage title={`Post · ${teamNumber}`} parentHref={parent}>
      <TeamScouting
        kind="post"
        game={activeGame}
        eventKey={event.key}
        teamNumber={Number(teamNumber)}
        level={finish.level}
        allowNew={settings.scoutingOpen || session.role === "admin"}
        postOverride={session.role === "admin" || settings.postOpenEarly}
        stage={stage}
        onStageChange={(s) =>
          void navigate({ search: { stage: s }, replace: true })
        }
        online={online}
        onSubmitted={finish.onSubmitted}
        nextActions={finish.nextActions}
      />
    </ScoutingPage>
  )
}
