import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { Button } from "@/components/controls/button"
import { Ellipsis, Star } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { ActionMenu } from "@/components/overlays/menu"
import { useToast } from "@/components/overlays/toaster"
import { activeGame } from "@/config/game"
import {
  useTeam,
  useTeamMatches,
  useTeamPit,
  useTeamPost,
  useTeamPhotos,
} from "@/features/teams/api/get-teams"
import { TEAM_VIEWS } from "@/features/teams/types/team-views"
import {
  TeamDetailView,
  TeamPhotoHero,
  TeamMatches,
  TeamNotes,
  TeamOverview,
  TeamPitView,
  TeamPostView,
} from "@/features/teams/components/team-detail-view"
import { NoteComposer } from "@/components/notes/note-composer"
import { useEventTeamMetrics } from "@/hooks/use-event-team-metrics"
import { useAddNote, useDeleteNote, useNotes } from "@/hooks/use-notes"
import { can } from "@/lib/authorization"
import { useWatchedTeams } from "@/hooks/use-prefs"

export const Route = createFileRoute("/_authed/_event/_tabs/teams/$teamNumber")(
  {
    validateSearch: z.object({
      view: z.enum(TEAM_VIEWS).optional().catch(undefined),
      notes: z.enum(["all", "team", "private"]).optional().catch(undefined),
    }),
    component: TeamDetailRoute,
  }
)

function TeamDetailRoute() {
  const params = Route.useParams()
  const teamNumber = Number(params.teamNumber)
  const { event, session } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const go = useNavigate()
  const toast = useToast()
  const view = search.view ?? "overview"
  const team = useTeam(event.key, teamNumber)
  const photos = useTeamPhotos(event.key, teamNumber)
  const { watched, toggle } = useWatchedTeams()
  const isWatched = watched.has(teamNumber)

  return (
    <StackPage
      title={String(params.teamNumber)}
      titleMode="inline"
      leading={<NavBackButton parentHref="/teams" label="Teams" />}
      trailing={
        <>
          <button
            type="button"
            aria-pressed={isWatched}
            aria-label="Watch"
            onClick={() => {
              void toggle(teamNumber)
              toast.show({
                title: isWatched
                  ? `Stopped watching ${teamNumber}`
                  : `Watching ${teamNumber}`,
              })
            }}
            className="inline-flex size-11 items-center justify-center rounded-full text-primary"
          >
            <Star
              aria-hidden
              size={22}
              className={isWatched ? "fill-current" : undefined}
            />
          </button>
          <ActionMenu
            trigger={<Ellipsis aria-hidden size={22} />}
            actions={[
              {
                label: "All Matches",
                onSelect: () =>
                  void go({ to: "/matches", search: { team: teamNumber } }),
              },
              {
                label: "Copy Link",
                onSelect: () =>
                  void navigator.clipboard
                    .writeText(window.location.href)
                    .then(() => toast.show({ title: "Link copied" })),
              },
            ]}
          />
        </>
      }
    >
      <TeamDetailView
        state={team}
        teamNumber={teamNumber}
        view={view}
        hero={<TeamPhotoHero photos={photos} teamNumber={teamNumber} />}
        actions={
          can(session, "scouting:create") ? (
            <ScoutActions
              eventKey={event.key}
              teamNumber={teamNumber}
              view={view}
            />
          ) : undefined
        }
        onViewChange={(v) =>
          void navigate({
            search: (prev) => ({
              ...prev,
              view: v === "overview" ? undefined : v,
            }),
            replace: true,
          })
        }
      >
        {view === "overview" && team.status === "success" ? (
          <Overview
            eventKey={event.key}
            teamNumber={teamNumber}
            team={team.data}
          />
        ) : view === "matches" ? (
          <MatchesView eventKey={event.key} teamNumber={teamNumber} />
        ) : view === "notes" ? (
          <NotesView
            eventKey={event.key}
            teamNumber={teamNumber}
            filter={search.notes ?? "all"}
            onFilterChange={(notes) =>
              void navigate({
                search: (prev) => ({
                  ...prev,
                  notes: notes === "all" ? undefined : notes,
                }),
                replace: true,
              })
            }
            canWritePrivate={session.role !== "guest"}
            canWrite={can(session, "comment:create")}
          />
        ) : view === "pit" ? (
          <PitView eventKey={event.key} teamNumber={teamNumber} />
        ) : view === "post" ? (
          <PostView eventKey={event.key} teamNumber={teamNumber} />
        ) : null}
      </TeamDetailView>
    </StackPage>
  )
}

// each sub-view subscribes only while shown

function Overview({
  eventKey,
  teamNumber,
  team,
}: {
  eventKey: string
  teamNumber: number
  team: Parameters<typeof TeamOverview>[0]["team"]
}) {
  const metrics = useEventTeamMetrics(eventKey, "all")
  return (
    <TeamOverview
      game={activeGame}
      team={team}
      metrics={metrics.byTeam?.get(teamNumber)}
    />
  )
}

function MatchesView({
  eventKey,
  teamNumber,
}: {
  eventKey: string
  teamNumber: number
}) {
  const { session } = Route.useRouteContext()
  const canScout = can(session, "scouting:create")
  const navigate = useNavigate()
  return (
    <TeamMatches
      state={useTeamMatches(eventKey, teamNumber)}
      teamNumber={teamNumber}
      onScout={
        canScout
          ? (matchKey) =>
              void navigate({
                to: "/scouting/match/$matchKey/$teamNumber",
                params: { matchKey, teamNumber: String(teamNumber) },
              })
          : undefined
      }
    />
  )
}

function NotesView({
  eventKey,
  teamNumber,
  canWrite,
  ...rest
}: {
  eventKey: string
  teamNumber: number
  canWrite: boolean
} & Omit<Parameters<typeof TeamNotes>[0], "state" | "composer" | "onDelete">) {
  const add = useAddNote(eventKey)
  const del = useDeleteNote()
  const toast = useToast()
  return (
    <TeamNotes
      state={useNotes({ eventKey, teamNumber })}
      {...rest}
      onDelete={(id) =>
        void del(id).then(() => toast.show({ title: "Note deleted" }))
      }
      composer={
        canWrite ? (
          <NoteComposer
            allowPrivate={rest.canWritePrivate}
            onAdd={(n) => add({ teamNumber, ...n })}
          />
        ) : undefined
      }
    />
  )
}

function PitView({
  eventKey,
  teamNumber,
}: {
  eventKey: string
  teamNumber: number
}) {
  return (
    <TeamPitView game={activeGame} state={useTeamPit(eventKey, teamNumber)} />
  )
}

function PostView({
  eventKey,
  teamNumber,
}: {
  eventKey: string
  teamNumber: number
}) {
  return (
    <TeamPostView game={activeGame} state={useTeamPost(eventKey, teamNumber)} />
  )
}

/** Thumb-zone actions (teams.md T2): scout the team's next match, pit scout, or post-scout. */
function ScoutActions({
  eventKey,
  teamNumber,
  view,
}: {
  eventKey: string
  teamNumber: number
  view: string
}) {
  const go = useNavigate()
  const matches = useTeamMatches(eventKey, teamNumber)
  const next =
    matches.status === "success"
      ? matches.data.find((m) => m.status !== "played")
      : undefined
  const team = String(teamNumber)
  return (
    <div className="flex gap-2">
      {view === "pit" || !next ? (
        <Button
          size="large"
          className="flex-1"
          onClick={() =>
            void go({
              to: "/scouting/pit/$teamNumber",
              params: { teamNumber: team },
            })
          }
        >
          Pit Scout
        </Button>
      ) : view === "post" ? (
        <Button
          size="large"
          className="flex-1"
          onClick={() =>
            void go({
              to: "/scouting/post/$teamNumber",
              params: { teamNumber: team },
            })
          }
        >
          Post-Scout
        </Button>
      ) : (
        <Button
          size="large"
          className="flex-1"
          onClick={() =>
            void go({
              to: "/scouting/match/$matchKey/$teamNumber",
              params: { matchKey: next.key, teamNumber: team },
            })
          }
        >
          Scout {teamNumber} Next
        </Button>
      )}
    </div>
  )
}
