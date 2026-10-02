import {
  createFileRoute,
  stripSearchParams,
  useRouter,
} from "@tanstack/react-router"
import { useCallback, useEffect, useMemo } from "react"
import { TabRootActions } from "@/app/tab-root-actions"
import { StackPage } from "@/components/layout/stack-page"
import { activeGame } from "@/config/game"
import { useEventTeams } from "@/features/teams/api/get-teams"
import { TeamListView } from "@/features/teams/components/team-list-view"
import type { TeamsPatch } from "@/features/teams/components/team-list-view"
import {
  ColumnsSheet,
  TeamFilterSheet,
  TeamsToolbar,
} from "@/features/teams/components/teams-toolbar"
import {
  forRole,
  teamsSearch,
  teamsSearchDefaults,
} from "@/features/teams/types/teams-search"
import {
  availableColumns,
  resolveColumns,
} from "@/features/teams/utils/columns"
import { useEventTeamMetrics } from "@/hooks/use-event-team-metrics"
import { useOurTeam } from "@/hooks/use-our-team"
import { usePrefs, useSetPrefs, useWatchedTeams } from "@/hooks/use-prefs"
import { can } from "@/lib/authorization"

export const Route = createFileRoute("/_authed/_event/_tabs/teams/")({
  validateSearch: teamsSearch,
  search: { middlewares: [stripSearchParams(teamsSearchDefaults)] },
  component: TeamsTab,
})

function TeamsTab() {
  const { event, session } = Route.useRouteContext()
  const raw = Route.useSearch()
  const navigate = Route.useNavigate()
  const canScout = can(session, "scouting:create")
  const search = forRole(raw, canScout)

  const router = useRouter()
  const onSearchChange = useCallback(
    (patch: TeamsPatch) => {
      // the search box writes the URL 300 ms after typing; if the user already tapped a result,
      // that write would cancel the navigation and bounce them back to the list
      if (router.latestLocation.pathname !== router.state.location.pathname)
        return
      void navigate({
        search: (prev) => ({ ...prev, ...patch }),
        replace: patch.sheet === undefined,
      })
    },
    [navigate, router]
  )
  const needsRewrite = raw.pit !== search.pit || raw.sort !== search.sort
  useEffect(() => {
    if (needsRewrite)
      void navigate({
        search: (prev) => ({
          ...prev,
          pit: "any",
          coverage: "any",
          sort: search.sort,
        }),
        replace: true,
      })
  }, [needsRewrite, navigate, search.sort])

  const state = useEventTeams(event.key)
  const metrics = useEventTeamMetrics(event.key, search.window)
  const ourTeam = useOurTeam()
  const { watched } = useWatchedTeams()
  const prefs = usePrefs()
  const setPrefs = useSetPrefs()
  const columns = useMemo(
    () => resolveColumns(activeGame, prefs.teamListColumns),
    [prefs.teamListColumns]
  )
  const available = useMemo(() => availableColumns(activeGame), [])

  return (
    <StackPage
      title="Teams"
      trailing={
        <>
          <TabRootActions />
          <TeamsToolbar
            game={activeGame}
            search={search}
            onSearchChange={onSearchChange}
            canScout={canScout}
          />
        </>
      }
    >
      <TeamListView
        game={activeGame}
        state={state}
        metrics={metrics.byTeam}
        refreshing={metrics.refreshing}
        coverageTarget={metrics.coverageTarget}
        columns={columns}
        search={search}
        onSearchChange={onSearchChange}
        ourTeam={ourTeam}
        watched={watched}
        canScout={canScout}
      />
      <TeamFilterSheet
        game={activeGame}
        search={search}
        onSearchChange={onSearchChange}
        canScout={canScout}
      />
      <ColumnsSheet
        open={search.sheet === "columns"}
        onOpenChange={(open) => {
          if (!open) onSearchChange({ sheet: undefined })
        }}
        available={available}
        chosen={columns}
        onChange={(ids) => void setPrefs({ teamListColumns: ids })}
      />
    </StackPage>
  )
}
