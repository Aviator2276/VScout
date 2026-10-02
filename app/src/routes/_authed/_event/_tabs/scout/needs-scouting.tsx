import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { useRecommendation } from "@/features/scouting/api/get-recommendations"
import { NeedsScoutingList } from "@/features/scouting/components/needs-scouting"
import { useOurTeam } from "@/hooks/use-our-team"
import { useWatchedTeams } from "@/hooks/use-prefs"
import { requirePermission } from "@/lib/authorization"
import type { DataState } from "@/lib/db/react/data-state"
import type { Recommendation } from "@/features/scouting/utils/recommend-slots"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/scout/needs-scouting"
)({
  validateSearch: z.object({
    match: z.string().max(40).optional().catch(undefined),
  }),
  beforeLoad: ({ context }) => {
    requirePermission(context.session, "scouting:create")
  },
  component: NeedsScouting,
})

function NeedsScouting() {
  const { event } = Route.useRouteContext()
  const { match } = Route.useSearch()
  const navigate = useNavigate()
  const ourTeam = useOurTeam()
  const { watched } = useWatchedTeams()
  const rec = useRecommendation(event.key, { ourTeam, watched })
  // ?match= scopes the list to one match's robots, best first
  const state: DataState<Recommendation> =
    match && rec.status === "success"
      ? (() => {
          const all = rec.data.all.filter((s) => s.matchKey === match)
          return all.length
            ? {
                status: "success",
                data: { primary: all[0] ?? null, alternates: [], all },
              }
            : { status: "empty" }
        })()
      : rec
  return (
    <StackPage
      title="Needs Scouting"
      leading={<NavBackButton parentHref="/scout" label="Scout" />}
    >
      <NeedsScoutingList
        state={state}
        onStart={(s) =>
          void navigate({
            to: "/scouting/match/$matchKey/$teamNumber",
            params: { matchKey: s.matchKey, teamNumber: String(s.teamNumber) },
          })
        }
      />
    </StackPage>
  )
}
