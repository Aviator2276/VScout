// The team list (teams.md T1): search, quick chips, the All · Recent 4 window, a footnote saying how
// it's sorted, and virtualized rows with an Unranked group under a rank sort.
import { useMemo } from "react"
import type { ReactNode } from "react"
import { ChipGroup } from "@/components/controls/chip-group"
import { Segmented } from "@/components/controls/segmented"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { SearchField } from "@/components/form/search-field"
import {
  ClipboardList,
  SearchX,
  Star,
  StarOff,
  UsersRound,
} from "@/components/icons/icon"
import { Button } from "@/components/controls/button"
import { VirtualList } from "@/components/list/virtual-list"
import { RefreshingIndicator } from "@/components/sync/sync-badge"
import { t } from "@/games/kit/labels"
import type { GameDefinition } from "@/games/types"
import { useSearchQuery } from "@/hooks/use-search-query"
import type { DataState } from "@/lib/db/react/data-state"
import type { TeamMetrics } from "@/lib/metrics/event-team-metrics"
import type { TeamsSearch } from "../types/teams-search"
import type { Column } from "../utils/columns"
import {
  matchQuality,
  parseTeamQuery,
  passesFilters,
  sortTeams,
} from "../utils/team-list"
import type { TeamRow as TeamRowData } from "../utils/team-list"
import { TeamRow } from "./team-row"
import { SwipeRow } from "@/components/list/swipe-row"

export type TeamsPatch = Partial<TeamsSearch>

export interface TeamListViewProps {
  game: GameDefinition
  state: DataState<ReadonlyArray<TeamRowData>>
  metrics: ReadonlyMap<number, TeamMetrics> | null
  refreshing: boolean
  coverageTarget: number
  columns: ReadonlyArray<Column>
  search: TeamsSearch
  onSearchChange: (patch: TeamsPatch) => void
  ourTeam: number | null
  watched: ReadonlySet<number>
  canScout: boolean
  /** swipe right on a row (owner: swipe actions on lists) */
  onToggleWatch?: (teamNumber: number) => void
  /** swipe left on a row, scouters only */
  onPitScout?: (teamNumber: number) => void
  /** sort, columns and filter, beside the search field */
  searchActions?: ReactNode
}

const NO_METRICS: ReadonlyMap<number, TeamMetrics> = new Map()

type ListItem =
  | { kind: "header"; id: string; title: string; sticky: true }
  | { kind: "row"; id: string; team: TeamRowData; position: number }

const QUICK = ["watched", "needs-pit", "under-scouted"] as const
type Quick = (typeof QUICK)[number]

export function sortLabel(game: GameDefinition, key: string): string {
  const base: Record<string, string> = {
    rank: "Rank",
    number: "Team Number",
    name: "Name",
    pit: "Pit Status",
    scouted: "Scouted Matches",
  }
  if (base[key]) return base[key]
  const metric = game.metrics.find((m) => m.id === key)
  if (metric) return t(game, metric.label)
  const col = game.teamListColumns.find(
    (c) => "external" in c.source && c.source.external === key
  )
  return col ? t(game, col.label) : key.toUpperCase()
}

export function TeamListView({
  game,
  state,
  metrics,
  refreshing,
  coverageTarget,
  columns,
  search,
  onSearchChange,
  ourTeam,
  watched,
  canScout,
  onToggleWatch,
  onPitScout,
  searchActions,
}: TeamListViewProps) {
  const { query, deferred, setQuery } = useSearchQuery(search.q, (q) =>
    onSearchChange({ q })
  )
  const parsed = useMemo(
    () => parseTeamQuery(deferred, ourTeam),
    [deferred, ourTeam]
  )
  const rows = state.status === "success" ? state.data : null
  const byTeam = metrics ?? NO_METRICS

  const sorted = useMemo(() => {
    if (!rows) return null
    const hits = rows.filter(
      (r) =>
        matchQuality(r, parsed, ourTeam) > 0 &&
        passesFilters(r, metrics?.get(r.teamNumber), search, {
          watched,
          coverageTarget,
        })
    )
    return sortTeams(
      game,
      hits,
      metrics ?? NO_METRICS,
      search.sort,
      search.dir,
      parsed.empty ? undefined : (r) => matchQuality(r, parsed, ourTeam)
    )
  }, [rows, parsed, ourTeam, metrics, search, watched, coverageTarget, game])

  const items = useMemo((): Array<ListItem> => {
    if (!sorted) return []
    const total = sorted.ranked.length + sorted.unranked.length
    const out: Array<ListItem> = sorted.ranked.map((team, i) => ({
      kind: "row",
      id: String(team.teamNumber),
      team,
      position: i + 1,
    }))
    if (sorted.unranked.length > 0) {
      out.push({
        kind: "header",
        id: "h:unranked",
        title: "Unranked",
        sticky: true,
      })
      sorted.unranked.forEach((team, i) =>
        out.push({
          kind: "row",
          id: String(team.teamNumber),
          team,
          position: sorted.ranked.length + i + 1,
        })
      )
    }
    return total === 0 ? [] : out
  }, [sorted])
  const count = sorted ? sorted.ranked.length + sorted.unranked.length : 0

  const listState: DataState<Array<ListItem>> =
    state.status === "success"
      ? count > 0
        ? { status: "success", data: items, stale: state.stale === true }
        : { status: "empty" }
      : state
  const noResults = state.status === "success" && count === 0

  const badges = useMemo(
    () =>
      game.capabilities
        .filter((c) => c.display === "badge")
        .map((c) => ({ id: c.id, label: t(game, c.label) })),
    [game]
  )

  const quickValue: Array<Quick> = [
    ...(search.watched ? (["watched"] as const) : []),
    ...(search.pit === "none" ? (["needs-pit"] as const) : []),
    ...(search.coverage === "under-target" ? (["under-scouted"] as const) : []),
  ]
  const onQuick = (next: Array<Quick>) =>
    onSearchChange({
      watched: next.includes("watched") || undefined,
      pit: next.includes("needs-pit")
        ? "none"
        : search.pit === "none"
          ? "any"
          : search.pit,
      coverage: next.includes("under-scouted") ? "under-target" : "any",
    })
  const clearFilters = () =>
    onSearchChange({
      watched: undefined,
      pit: "any",
      coverage: "any",
      drivetrain: undefined,
      cap: undefined,
      capSource: "either",
      ranked: "any",
    })

  const dir = search.dir ?? (search.sort === "rank" ? "asc" : undefined)
  const footnote = !parsed.empty
    ? `Best matches for ‘${deferred.trim()}’`
    : `Sorted by ${sortLabel(game, search.sort)}${dir ? (dir === "asc" ? " ↑" : " ↓") : ""} · ${columns.length} columns`

  return (
    <>
      <SearchField
        landmark="Teams"
        label="Search teams"
        placeholder="Number or name"
        value={query}
        onValueChange={setQuery}
        footnote={
          parsed.noTeamNumber ? "No team number yet. Ask an admin." : undefined
        }
        actions={searchActions}
      />
      <div className="flex flex-col gap-2 pb-2">
        <ChipGroup
          compact
          label="Quick filters"
          options={[
            { value: "watched" as const, label: "Watched" },
            ...(canScout
              ? [
                  { value: "needs-pit" as const, label: "Needs Pit" },
                  { value: "under-scouted" as const, label: "Under-Scouted" },
                ]
              : []),
          ]}
          value={quickValue}
          onValueChange={onQuick}
        />
        <Segmented
          label="Metric window"
          value={search.window}
          onValueChange={(window) => onSearchChange({ window })}
          options={[
            { value: "all", label: "All Matches" },
            { value: "recent", label: "Recent 4" },
          ]}
        />
        <div className="flex min-h-11 items-center justify-between gap-2 px-1 text-footnote text-muted-foreground">
          <span aria-live="polite">{footnote}</span>
          <span className="flex items-center gap-2">
            {refreshing ? <RefreshingIndicator /> : null}
            <button
              type="button"
              onClick={() => onSearchChange({ sheet: "columns" })}
              className="min-h-11 text-primary"
            >
              Columns…
            </button>
          </span>
        </div>
      </div>
      <DataView state={listState} size="page">
        <DataView.Loading label="Loading teams…">
          <SkeletonRows rows={8} rowClassName="h-16" />
        </DataView.Loading>
        <DataView.Empty
          {...(noResults
            ? {
                icon: SearchX,
                title: query
                  ? `No team matches ‘${deferred.trim()}’`
                  : search.cap?.length
                    ? "No teams with these capabilities"
                    : "No teams with these filters",
                action: (
                  <div className="flex gap-2">
                    {query ? (
                      <Button variant="secondary" onClick={() => setQuery("")}>
                        Clear Search
                      </Button>
                    ) : null}
                    <Button variant="secondary" onClick={clearFilters}>
                      Clear Filters
                    </Button>
                  </div>
                ),
              }
            : {
                icon: UsersRound,
                title: "No teams yet",
                description:
                  "The team list appears when the event publishes it.",
              })}
        />
        <DataView.Missing
          not-synced={{
            title: "Team list not downloaded yet",
            description: "Connect to download it.",
          }}
        />
        <DataView.Error title="Couldn’t load teams." />
        <DataView.Success>
          {(data: Array<ListItem>) => (
            <VirtualList
              label="Teams"
              items={data}
              restorationId="teams-list"
              estimateSize={(it) => (it.kind === "row" ? 64 : 32)}
              renderItem={(it) =>
                it.kind === "row" ? (
                  <SwipeRow
                    leading={
                      onToggleWatch
                        ? [
                            watched.has(it.team.teamNumber)
                              ? {
                                  label: "Unwatch",
                                  icon: StarOff,
                                  tone: "warning",
                                  onAction: () =>
                                    onToggleWatch(it.team.teamNumber),
                                }
                              : {
                                  label: "Watch",
                                  icon: Star,
                                  tone: "warning",
                                  onAction: () =>
                                    onToggleWatch(it.team.teamNumber),
                                },
                          ]
                        : []
                    }
                    trailing={
                      onPitScout && canScout
                        ? [
                            {
                              label: "Pit Scout",
                              icon: ClipboardList,
                              tone: "primary",
                              onAction: () => onPitScout(it.team.teamNumber),
                            },
                          ]
                        : []
                    }
                  >
                    <TeamRow
                      team={it.team}
                      metrics={byTeam.get(it.team.teamNumber)}
                      columns={columns}
                      badges={badges}
                      drivetrainLabel={drivetrainName(
                        byTeam.get(it.team.teamNumber)?.drivetrain
                      )}
                      watched={watched.has(it.team.teamNumber)}
                      showPit={canScout}
                      position={it.position}
                      setSize={count}
                    />
                  </SwipeRow>
                ) : (
                  <div className="flex h-8 items-center px-3 text-footnote text-muted-foreground uppercase">
                    {it.title}
                  </div>
                )
              }
            />
          )}
        </DataView.Success>
      </DataView>
    </>
  )
}

const DRIVETRAIN: Record<string, string> = {
  swerve: "Swerve",
  tank: "Tank",
  mecanum: "Mecanum",
  other: "Other drive",
}

export function drivetrainName(d: string | undefined): string | null {
  return d ? (DRIVETRAIN[d] ?? null) : null
}
