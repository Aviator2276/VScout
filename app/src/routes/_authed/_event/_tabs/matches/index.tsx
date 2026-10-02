import {
  createFileRoute,
  stripSearchParams,
  useRouter,
} from "@tanstack/react-router"
import { useCallback, useEffect } from "react"
import { TabRootActions } from "@/app/tab-root-actions"
import { StackPage } from "@/components/layout/stack-page"
import {
  useEventMatches,
  useMatchCoverage,
  useMatchListContext,
} from "@/features/matches/api/get-matches"
import { MatchListView } from "@/features/matches/components/match-list-view"
import type { SearchPatch } from "@/features/matches/components/match-list-view"
import {
  MatchFilterSheet,
  MatchesToolbar,
} from "@/features/matches/components/matches-toolbar"
import {
  forRole,
  matchesSearch,
  matchesSearchDefaults,
} from "@/features/matches/types/matches-search"
import { useNow } from "@/hooks/use-now"
import { useOurTeam } from "@/hooks/use-our-team"
import { useWatchedTeams } from "@/hooks/use-prefs"
import { can } from "@/lib/authorization"

export const Route = createFileRoute("/_authed/_event/_tabs/matches/")({
  validateSearch: matchesSearch,
  search: { middlewares: [stripSearchParams(matchesSearchDefaults)] },
  component: MatchesTab,
})

function MatchesTab() {
  const { event, session } = Route.useRouteContext()
  const raw = Route.useSearch()
  const navigate = Route.useNavigate()
  const canScout = can(session, "scouting:create")
  const search = forRole(raw, canScout)

  const router = useRouter()
  const onSearchChange = useCallback(
    (patch: SearchPatch) => {
      // the search box writes the URL 300 ms after typing; if the user already tapped a result,
      // that write would cancel the navigation and bounce them back to the list
      if (router.latestLocation.pathname !== router.state.location.pathname)
        return
      void navigate({
        search: (prev) => ({ ...prev, ...patch }),
        // opening the sheet is a step Back can undo; typing and toggles aren't
        replace: patch.sheet === undefined,
      })
    },
    [navigate, router]
  )

  // a guest link with scouter-only keys: rewrite the URL without them (criterion 9)
  const needsRewrite =
    raw.scouted !== search.scouted || raw.sort !== search.sort
  useEffect(() => {
    if (needsRewrite)
      void navigate({
        search: (prev) => ({ ...prev, scouted: "any", sort: search.sort }),
        replace: true,
      })
  }, [needsRewrite, navigate, search.sort])

  const state = useEventMatches(event.key)
  const coverage = useMatchCoverage(event.key)
  const context = useMatchListContext(event.key)
  const ourTeam = useOurTeam()
  const { watched } = useWatchedTeams()
  const now = useNow()

  return (
    <StackPage
      title="Matches"
      trailing={
        <>
          <TabRootActions />
          <MatchesToolbar
            search={search}
            onSearchChange={onSearchChange}
            canScout={canScout}
          />
        </>
      }
    >
      <MatchListView
        state={state}
        coverage={coverage}
        context={context}
        search={search}
        onSearchChange={onSearchChange}
        ourTeam={ourTeam}
        watched={watched}
        canScout={canScout}
        now={now}
      />
      <MatchFilterSheet
        search={search}
        onSearchChange={onSearchChange}
        canScout={canScout}
        hasTeamNumber={ourTeam !== null}
      />
    </StackPage>
  )
}
