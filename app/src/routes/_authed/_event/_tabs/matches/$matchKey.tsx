import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { Ellipsis } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { ActionMenu } from "@/components/overlays/menu"
import { useToast } from "@/components/overlays/toaster"
import {
  useMatch,
  useMatchCoverage,
  useMatchEntries,
  useMatchTeams,
} from "@/features/matches/api/get-matches"
import { NO_COVERAGE, toMatchView } from "@/features/matches/utils/match-view"
import { MatchDetailView } from "@/features/matches/components/match-detail-view"
import { longMatchLabel, parseMatchKey } from "@/utils/match-label"
import {
  useMyMatchEntries,
  useRecommendation,
} from "@/features/scouting/api/get-recommendations"
import { MatchVideoSheet } from "@/features/matches/components/match-video-sheet"
import { StationPickerSheet } from "@/features/scouting/components/station-picker-sheet"
import type { PickerRobot } from "@/features/scouting/components/station-picker-sheet"
import { STATION_ORDER } from "@/features/scouting/utils/recommend-slots"
import { Button } from "@/components/controls/button"
import { BottomActionBar } from "@/components/layout/bottom-action-bar"
import { activeGame } from "@/config/game"
import { useEventTeamMetrics } from "@/hooks/use-event-team-metrics"
import { useWatchedTeams } from "@/hooks/use-prefs"
import { useNotes } from "@/hooks/use-notes"
import { useOnline } from "@/hooks/use-online"
import { useNow } from "@/hooks/use-now"
import { useOurTeam } from "@/hooks/use-our-team"
import { can } from "@/lib/authorization"
import type { DataState } from "@/lib/db/react/data-state"

export const Route = createFileRoute("/_authed/_event/_tabs/matches/$matchKey")(
  {
    validateSearch: z.object({
      sheet: z.enum(["video", "scout-team"]).optional().catch(undefined),
    }),
    component: MatchDetail,
  }
)

function MatchDetail() {
  const { matchKey } = Route.useParams()
  const { event, session } = Route.useRouteContext()
  const navigate = useNavigate()
  const toast = useToast()
  const id = parseMatchKey(matchKey)
  const title = id ? longMatchLabel(id) : "Match"
  const state = useMatch(matchKey)
  const coverage = useMatchCoverage(event.key)
  const teams = useMatchTeams(
    event.key,
    state.status === "success" ? state.data.teamNumbers : []
  )
  const notes = useNotes({ eventKey: event.key, matchKey })
  const entries = useMatchEntries(event.key, matchKey)
  const metrics = useEventTeamMetrics(event.key, "all")
  const ourTeam = useOurTeam()
  const now = useNow()
  const online = useOnline()
  // a key from another event is "not in this event", never another event's match
  const canScout = can(session, "scouting:create")
  const search = Route.useSearch()
  const nav = Route.useNavigate()
  const { watched } = useWatchedTeams()
  const rec = useRecommendation(event.key, { ourTeam, watched })
  const mine = useMyMatchEntries(matchKey)
  const coverageRow = coverage.get(matchKey)
  const robots: Array<PickerRobot> =
    state.status === "success"
      ? STATION_ORDER.flatMap((station, i) => {
          const m = state.data
          const team =
            i < 3
              ? m.alliances.red.teamNumbers[i]
              : m.alliances.blue.teamNumbers[i - 3]
          if (team === undefined) return []
          const needed =
            rec.status === "success" &&
            rec.data.all.some(
              (s) =>
                s.matchKey === matchKey &&
                s.teamNumber === team &&
                (s.reason.kind === "gap" || s.reason.kind === "last-chance")
            )
          return [
            {
              station,
              teamNumber: team,
              entries: coverageRow?.[i] ?? 0,
              needed,
              mine: mine.has(team),
            },
          ]
        })
      : []
  // once played, Scout a Robot moves from the thumb zone into the ⋯ menu (ADR-078)
  const played =
    state.status === "success" &&
    toMatchView(state.data, NO_COVERAGE, now).played
  const openPicker = () => void nav({ search: { sheet: "scout-team" } })
  const scoped: DataState<never> | null = matchKey.startsWith(`${event.key}_`)
    ? null
    : { status: "missing", reason: "not-found" }

  return (
    <StackPage
      title={title}
      titleMode="inline"
      leading={<NavBackButton parentHref="/matches" label="Matches" />}
      trailing={
        <ActionMenu
          trigger={<Ellipsis aria-hidden size={22} />}
          actions={[
            {
              label: "Pre-Match Strategy",
              onSelect: () =>
                void navigate({ href: `/scout/strategy/${matchKey}` }),
            },
            {
              label: "Videos",
              onSelect: () => void nav({ search: { sheet: "video" } }),
            },
            {
              label: "Downloaded Videos",
              onSelect: () => void navigate({ to: "/matches/videos" }),
            },
            ...(canScout && played
              ? [{ label: "Scout a Robot", onSelect: openPicker }]
              : []),
            {
              label: "Copy Link",
              onSelect: () => {
                void navigator.clipboard
                  .writeText(window.location.href)
                  .then(() => toast.show({ title: "Link copied" }))
              },
            },
          ]}
        />
      }
    >
      <MatchDetailView
        game={activeGame}
        state={scoped ?? state}
        label={title}
        teams={teams}
        coverage={coverage.get(matchKey)}
        entries={entries}
        metrics={metrics.byTeam ?? undefined}
        notes={notes}
        showCoverage={canScout}
        ourTeam={ourTeam}
        now={now}
        strategyHref={`/scout/strategy/${matchKey}`}
        scoutAction={
          canScout ? (
            <BottomActionBar label="Match actions">
              <Button
                size="large"
                className="flex-1 shadow-lg"
                onClick={openPicker}
              >
                Scout a Robot
              </Button>
            </BottomActionBar>
          ) : undefined
        }
      />
      <MatchVideoSheet
        open={search.sheet === "video"}
        onOpenChange={(open) => {
          if (!open) void nav({ search: {}, replace: true })
        }}
        eventKey={event.key}
        matchKey={matchKey}
        title={title}
        online={online}
      />
      {canScout ? (
        <StationPickerSheet
          open={search.sheet === "scout-team"}
          onOpenChange={(open) => {
            if (!open) void nav({ search: {}, replace: true })
          }}
          title={title}
          robots={robots}
          onPick={(team) =>
            void navigate({
              to: "/scouting/match/$matchKey/$teamNumber",
              params: { matchKey, teamNumber: String(team) },
            })
          }
        />
      ) : null}
    </StackPage>
  )
}
