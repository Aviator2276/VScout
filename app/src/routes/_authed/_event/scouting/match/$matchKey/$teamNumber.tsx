import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { ScoutingPage, useScoutingFinish } from "@/app/scouting-chrome"
import { activeGame } from "@/config/game"
import { useScoutingSettings } from "@/features/scouting/api/get-scout-target"
import { MatchScouting } from "@/features/scouting/components/match-scouting"
import { useOnline } from "@/hooks/use-online"
import { parseMatchKey, shortMatchLabel } from "@/utils/match-label"

export const Route = createFileRoute(
  "/_authed/_event/scouting/match/$matchKey/$teamNumber"
)({
  validateSearch: z.object({
    stage: z.string().max(40).optional().catch(undefined),
  }),
  component: MatchScoutingRoute,
})

function MatchScoutingRoute() {
  const { matchKey, teamNumber } = Route.useParams()
  const { event, session } = Route.useRouteContext()
  const { stage } = Route.useSearch()
  const navigate = Route.useNavigate()
  const go = useNavigate()
  const online = useOnline()
  const settings = useScoutingSettings(event.key)
  const parent = `/matches/${matchKey}`
  const finish = useScoutingFinish(parent)
  const id = parseMatchKey(matchKey)
  return (
    <ScoutingPage
      title={`${id ? shortMatchLabel(id) : "Match"} · ${teamNumber}`}
      parentHref={parent}
    >
      <MatchScouting
        game={activeGame}
        eventKey={event.key}
        matchKey={matchKey}
        teamNumber={Number(teamNumber)}
        level={finish.level}
        allowNew={settings.scoutingOpen || session.role === "admin"}
        stage={stage}
        onStageChange={(s) =>
          void navigate({ search: { stage: s }, replace: true })
        }
        online={online}
        onSubmitted={finish.onSubmitted}
        nextActions={finish.nextActions}
        onPickStation={() =>
          void go({
            to: "/matches/$matchKey",
            params: { matchKey },
            search: { sheet: "scout-team" },
          })
        }
      />
    </ScoutingPage>
  )
}
