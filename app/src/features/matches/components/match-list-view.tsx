// The match list (matches.md M1): search, quick chips, sections with the Now divider, virtualized
// rows. Search and filters live in the URL; the route passes them in and writes them back.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChipGroup } from "@/components/controls/chip-group"
import { DataView } from "@/components/data-view/data-view"
import { SearchField } from "@/components/form/search-field"
import { ArrowDown, CalendarDays, SearchX, X } from "@/components/icons/icon"
import { Button } from "@/components/controls/button"
import { VirtualList } from "@/components/list/virtual-list"
import type { VirtualListHandle } from "@/components/list/virtual-list"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { useSearchQuery } from "@/hooks/use-search-query"
import type { DataState } from "@/lib/db/react/data-state"
import type { MatchRecord } from "@/lib/db/types"
import type { MatchListContext } from "../api/get-matches"
import type { MatchesSearch } from "../types/matches-search"
import { filterMatches } from "../utils/filter-matches"
import { NO_COVERAGE, toMatchView } from "../utils/match-view"
import type { Coverage } from "../utils/match-view"
import { parseMatchQuery } from "../utils/parse-match-query"
import { nextMatch, sortAndSection } from "../utils/sort-and-section-matches"
import type { ListItem } from "../utils/sort-and-section-matches"
import { MatchRow } from "./match-row"

export type SearchPatch = Partial<MatchesSearch>

export interface MatchListViewProps {
  state: DataState<ReadonlyArray<MatchRecord>>
  coverage: ReadonlyMap<string, Coverage>
  context: MatchListContext
  /** already role-adjusted (forRole) */
  search: MatchesSearch
  /** writes the URL; `replace` for typing and toggles */
  onSearchChange: (patch: SearchPatch) => void
  ourTeam: number | null
  watched: ReadonlySet<number>
  canScout: boolean
  now: number
}

const QUICK = ["ours", "watched", "unscouted", "upcoming"] as const
type Quick = (typeof QUICK)[number]

function quickValue(s: MatchesSearch): Array<Quick> {
  return [
    ...(s.ours ? (["ours"] as const) : []),
    ...(s.watched ? (["watched"] as const) : []),
    ...(s.scouted === "none" ? (["unscouted"] as const) : []),
    ...(s.status === "upcoming" ? (["upcoming"] as const) : []),
  ]
}

/** Copy for "filters exclude everything" (matches.md M1 no-results table). */
function noResultsTitle(
  s: MatchesSearch,
  q: string,
  ourTeam: number | null
): string {
  if (q) return `No matches for ‘${q}’`
  if (s.ours) return `No matches for ${ourTeam ?? "your team"} yet`
  if (s.watched) return "Your watched teams have no matches here"
  if (s.scouted === "none")
    return "Every robot in these matches has been scouted"
  if (s.status === "upcoming")
    return "No upcoming matches. Qualifications are done."
  return "No matches with these filters"
}

function MatchSkeleton() {
  return <SkeletonRows rows={6} rowClassName="h-16" />
}

export function MatchListView({
  state,
  coverage,
  context,
  search,
  onSearchChange,
  ourTeam,
  watched,
  canScout,
  now,
}: MatchListViewProps) {
  // typing filters on every keystroke; the URL follows 300 ms after the last key (criterion 7)
  const {
    query,
    deferred: deferredQuery,
    setQuery: onQuery,
  } = useSearchQuery(search.q, (q) => onSearchChange({ q }))

  const parsed = useMemo(
    () => parseMatchQuery(deferredQuery, ourTeam),
    [deferredQuery, ourTeam]
  )

  const records = state.status === "success" ? state.data : null
  const views = useMemo(
    () =>
      records?.map((m) =>
        toMatchView(m, coverage.get(m.key) ?? NO_COVERAGE, now)
      ) ?? [],
    [records, coverage, now]
  )
  const upNext = useMemo(() => nextMatch(views), [views])
  const filtered = useMemo(
    () =>
      filterMatches(views, parsed, search, {
        ourTeam,
        watched,
        nicknames: context.nicknames,
        videos: context.videos,
      }),
    [views, parsed, search, ourTeam, watched, context]
  )
  const sectioned = useMemo(
    () =>
      sortAndSection(filtered, search.sort, {
        timeZone: context.timeZone,
        upNextKey: upNext?.key ?? null,
      }),
    [filtered, search.sort, context.timeZone, upNext]
  )

  const listState: DataState<typeof sectioned> =
    state.status === "success"
      ? filtered.length > 0
        ? { status: "success", data: sectioned, stale: state.stale === true }
        : { status: "empty" }
      : state
  const noResults = state.status === "success" && filtered.length === 0

  const quickOptions = [
    {
      value: "ours" as const,
      label: "Ours",
      disabled: ourTeam === null,
    },
    { value: "watched" as const, label: "Watched" },
    ...(canScout ? [{ value: "unscouted" as const, label: "Unscouted" }] : []),
    { value: "upcoming" as const, label: "Upcoming" },
  ]

  const onQuick = (next: Array<Quick>) =>
    onSearchChange({
      ours: next.includes("ours") || undefined,
      watched: next.includes("watched") || undefined,
      scouted: next.includes("unscouted")
        ? "none"
        : search.scouted === "none"
          ? "any"
          : search.scouted,
      status: next.includes("upcoming")
        ? "upcoming"
        : search.status === "upcoming"
          ? "any"
          : search.status,
    })

  const clearFilters = () =>
    onSearchChange({
      ours: undefined,
      watched: undefined,
      scouted: "any",
      status: "any",
      level: "all",
      team: undefined,
      video: undefined,
    })

  const footnote = parsed.noTeamNumber
    ? "No team number yet. Ask an admin."
    : parsed.readAs.length > 0
      ? `Showing: ${parsed.readAs.join(" · ")}`
      : undefined

  return (
    <>
      <SearchField
        landmark="Matches"
        label="Search matches"
        placeholder="Team, match or “us”"
        value={query}
        onValueChange={onQuery}
        footnote={footnote}
      />
      <div className="pb-2">
        <ChipGroup
          label="Quick filters"
          options={quickOptions}
          value={quickValue(search)}
          onValueChange={onQuick}
        />
      </div>
      <ActiveFilters
        search={search}
        onSearchChange={onSearchChange}
        onClear={clearFilters}
      />
      <DataView state={listState} size="page">
        <DataView.Loading label="Loading matches…">
          <MatchSkeleton />
        </DataView.Loading>
        <DataView.Empty
          {...(noResults
            ? {
                icon: SearchX,
                title: noResultsTitle(search, deferredQuery.trim(), ourTeam),
                action: (
                  <div className="flex gap-2">
                    {query ? (
                      <Button variant="secondary" onClick={() => onQuery("")}>
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
                icon: CalendarDays,
                title: "No matches yet",
                description: "The schedule appears when it’s published.",
              })}
        />
        <DataView.Missing
          not-synced={{
            title: "Match schedule not downloaded yet",
            description: "Connect to download it.",
          }}
        />
        <DataView.Error title="Couldn’t load matches." />
        <DataView.Success>
          {(data: typeof sectioned) => (
            <MatchList
              sectioned={data}
              ourTeam={ourTeam}
              watched={watched}
              showCoverage={canScout}
              videos={context.videos}
              now={now}
              autoScroll={search.sort === "schedule" && !query}
            />
          )}
        </DataView.Success>
      </DataView>
    </>
  )
}

function ActiveFilters({
  search,
  onSearchChange,
  onClear,
}: {
  search: MatchesSearch
  onSearchChange: (patch: SearchPatch) => void
  onClear: () => void
}) {
  const chips: Array<{ label: string; clear: SearchPatch }> = []
  if (search.level !== "all")
    chips.push({
      label: `Level: ${search.level === "qm" ? "Quals" : "Playoffs"}`,
      clear: { level: "all" },
    })
  if (search.team !== undefined)
    chips.push({ label: `Team ${search.team}`, clear: { team: undefined } })
  if (search.status === "played")
    chips.push({ label: "Played", clear: { status: "any" } })
  if (search.scouted === "partial" || search.scouted === "full")
    chips.push({
      label: search.scouted === "full" ? "Fully scouted" : "Partly scouted",
      clear: { scouted: "any" },
    })
  if (search.video)
    chips.push({ label: "Downloaded videos", clear: { video: undefined } })
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 pb-2 text-subhead">
      <span className="text-muted-foreground">Active:</span>
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          aria-label={`Remove filter ${c.label}`}
          onClick={() => onSearchChange(c.clear)}
          className="inline-flex min-h-11 items-center gap-1 rounded-full bg-muted px-3"
        >
          {c.label}
          <X aria-hidden size={14} />
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="min-h-11 px-2 text-primary"
      >
        Clear All
      </button>
    </div>
  )
}

const SIZE: Record<ListItem["kind"], number> = { row: 64, header: 32, now: 36 }

function MatchList({
  sectioned,
  ourTeam,
  watched,
  showCoverage,
  videos,
  now,
  autoScroll,
}: {
  sectioned: ReturnType<typeof sortAndSection>
  ourTeam: number | null
  watched: ReadonlySet<number>
  showCoverage: boolean
  videos: ReadonlySet<string>
  now: number
  autoScroll: boolean
}) {
  const handle = useRef<VirtualListHandle | null>(null)
  const { items, upNextIndex, nowIndex, rowCount } = sectioned
  // the Up next match is the 2nd visible row: one row above it, then the divider (criterion 1)
  const target =
    upNextIndex < 0
      ? -1
      : Math.max(0, (nowIndex >= 0 ? nowIndex : upNextIndex) - 1)
  const [jumpVisible, setJumpVisible] = useState(false)
  const onVisibleRange = useCallback(
    (first: number, last: number) =>
      setJumpVisible(
        upNextIndex >= 0 && (upNextIndex < first || upNextIndex > last)
      ),
    [upNextIndex]
  )
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current || !autoScroll || target < 0) return
    scrolled.current = true
    // only on a fresh open; a restored scroll position wins
    if (window.scrollY < 8) handle.current?.scrollToIndex(target)
  }, [autoScroll, target])

  const listItems = useMemo(
    () => items.map((it) => ({ ...it, sticky: it.kind === "header" })),
    [items]
  )

  return (
    <>
      <VirtualList
        label="Matches"
        items={listItems}
        estimateSize={(it) => SIZE[it.kind]}
        handleRef={handle}
        onVisibleRange={onVisibleRange}
        restorationId="matches-list"
        renderItem={(it) =>
          it.kind === "row" ? (
            <MatchRow
              match={it.match}
              position={it.position}
              setSize={rowCount}
              upNext={it.upNext}
              ourTeam={ourTeam}
              watched={watched}
              showCoverage={showCoverage}
              hasVideo={videos.has(it.match.key)}
              now={now}
            />
          ) : it.kind === "now" ? (
            <div className="flex h-9 items-center gap-2 text-footnote font-semibold text-primary uppercase">
              <span className="h-px flex-1 bg-primary/40" />
              {it.title}
              <span className="h-px flex-1 bg-primary/40" />
            </div>
          ) : (
            <div className="flex h-8 items-center bg-background/95 px-1 text-footnote text-muted-foreground uppercase backdrop-blur">
              {it.title}
            </div>
          )
        }
      />
      {jumpVisible && target >= 0 ? (
        <button
          type="button"
          onClick={() => handle.current?.scrollToIndex(target, "smooth")}
          className="fixed bottom-[calc(var(--k-safe-area-bottom,0px)+6rem)] left-1/2 z-30 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-4 text-subhead font-semibold text-primary-foreground shadow-lg"
        >
          Jump to Now
          <ArrowDown aria-hidden size={16} />
        </button>
      ) : null}
    </>
  )
}
