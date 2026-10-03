import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { Button } from "@/components/controls/button"
import { Ellipsis, Star } from "@/components/icons/icon"
import { BottomActionBar } from "@/components/layout/bottom-action-bar"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { NoteComposer } from "@/components/notes/note-composer"
import { ActionMenu } from "@/components/overlays/menu"
import { useToast } from "@/components/overlays/toaster"
import { activeGame } from "@/config/game"
import {
  useTeam,
  useTeamEntries,
  useTeamMatches,
  useTeamPhotos,
  useTeamPit,
  useTeamPost,
} from "@/features/teams/api/get-teams"
import {
  TeamDetailView,
  TeamMatches,
  TeamNotes,
} from "@/features/teams/components/team-detail-view"
import { TeamOverview } from "@/features/teams/components/team-overview"
import { TEAM_VIEWS } from "@/features/teams/types/team-views"
import type { TeamViewKey } from "@/features/teams/types/team-views"
import { useEventTeamMetrics } from "@/hooks/use-event-team-metrics"
import { useAddNote, useDeleteNote, useNotes } from "@/hooks/use-notes"
import { useWatchedTeams } from "@/hooks/use-prefs"
import { can } from "@/lib/authorization"
import type { TeamDetail } from "@/features/teams/api/get-teams"

export const Route = createFileRoute("/_authed/_event/_tabs/teams/$teamNumber")(
  {
    validateSearch: z.object({
      // `pit` and `post` (merged into Overview, ADR-078) fall back to Overview
      view: z.enum(TEAM_VIEWS).optional().catch(undefined),
      window: z.enum(["recent"]).optional().catch(undefined),
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
  const canScout = can(session, "scouting:create")
  const setView = (v: TeamViewKey) =>
    void navigate({
      search: (prev) => ({ ...prev, view: v === "overview" ? undefined : v }),
      replace: true,
    })

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
        photoUrl={photos[0] ? (photos[0].thumbUrl ?? photos[0].url) : null}
        bottom={
          canScout ? (
            <ScoutNext eventKey={event.key} teamNumber={teamNumber} />
          ) : undefined
        }
        onViewChange={setView}
      >
        {view === "overview" && team.status === "success" ? (
          <Overview
            eventKey={event.key}
            team={team.data}
            windowParam={search.window}
            canScout={canScout}
            onAllNotes={() => setView("notes")}
          />
        ) : view === "matches" ? (
          <MatchesView
            eventKey={event.key}
            teamNumber={teamNumber}
            canScout={canScout}
          />
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
        ) : null}
      </TeamDetailView>
    </StackPage>
  )
}

// each sub-view subscribes only while shown

function Overview({
  eventKey,
  team,
  windowParam,
  canScout,
  onAllNotes,
}: {
  eventKey: string
  team: TeamDetail
  windowParam: "recent" | undefined
  canScout: boolean
  onAllNotes: () => void
}) {
  const navigate = Route.useNavigate()
  const go = useNavigate()
  const window = windowParam ?? "all"
  const all = useEventTeamMetrics(eventKey, "all")
  const recent = useEventTeamMetrics(eventKey, "recent")
  const selected = window === "recent" ? recent : all
  const teamNumber = team.teamNumber
  const pit = useTeamPit(eventKey, teamNumber)
  const scout = (
    to: "/scouting/pit/$teamNumber" | "/scouting/post/$teamNumber"
  ) => void go({ to, params: { teamNumber: String(teamNumber) } })
  return (
    <TeamOverview
      game={activeGame}
      team={team}
      window={window}
      onWindowChange={(w) =>
        void navigate({
          search: (prev) => ({
            ...prev,
            window: w === "recent" ? "recent" : undefined,
          }),
          replace: true,
        })
      }
      metrics={selected.byTeam?.get(teamNumber)}
      recent={recent.byTeam?.get(teamNumber)}
      byTeam={selected.byTeam ?? undefined}
      pit={pit}
      post={useTeamPost(eventKey, teamNumber)}
      notes={useNotes({ eventKey, teamNumber })}
      onAllNotes={onAllNotes}
      robotActions={
        canScout ? (
          <>
            <List.Row
              title={
                pit.status === "success" ? "Edit Pit Scouting" : "Pit Scout"
              }
              onSelect={() => scout("/scouting/pit/$teamNumber")}
            />
            <List.Row
              title="Post-Scout"
              onSelect={() => scout("/scouting/post/$teamNumber")}
            />
          </>
        ) : undefined
      }
    />
  )
}

function MatchesView({
  eventKey,
  teamNumber,
  canScout,
}: {
  eventKey: string
  teamNumber: number
  canScout: boolean
}) {
  const navigate = useNavigate()
  return (
    <TeamMatches
      game={activeGame}
      state={useTeamMatches(eventKey, teamNumber)}
      teamNumber={teamNumber}
      entries={useTeamEntries(eventKey, teamNumber)}
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

/** Thumb-zone action (teams.md T2): the team's next unplayed match, else Pit Scout if never pit scouted. */
function ScoutNext({
  eventKey,
  teamNumber,
}: {
  eventKey: string
  teamNumber: number
}) {
  const go = useNavigate()
  const matches = useTeamMatches(eventKey, teamNumber)
  const pit = useTeamPit(eventKey, teamNumber)
  const next =
    matches.status === "success"
      ? matches.data.find((m) => m.status !== "played")
      : undefined
  const team = String(teamNumber)
  if (next)
    return (
      <BottomActionBar label="Team actions">
        <Button
          size="large"
          className="flex-1 shadow-lg"
          onClick={() =>
            void go({
              to: "/scouting/match/$matchKey/$teamNumber",
              params: { matchKey: next.key, teamNumber: team },
            })
          }
        >
          Scout {teamNumber} Next
        </Button>
      </BottomActionBar>
    )
  if (pit.status === "missing")
    return (
      <BottomActionBar label="Team actions">
        <Button
          size="large"
          className="flex-1 shadow-lg"
          onClick={() =>
            void go({
              to: "/scouting/pit/$teamNumber",
              params: { teamNumber: team },
            })
          }
        >
          Pit Scout
        </Button>
      </BottomActionBar>
    )
  return null
}
