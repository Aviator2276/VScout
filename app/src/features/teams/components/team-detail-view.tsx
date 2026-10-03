// One team (teams.md T2, ADR-078): a compact header, then Overview · Matches · Notes (URL `view`).
// Overview lives in team-overview.tsx. Matches is a table of what this robot did in each played
// match (the game's summary fields) plus the upcoming ones.
import { use } from "react"
import type { ReactNode } from "react"
import { Segmented } from "@/components/controls/segmented"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { CalendarDays, MessageSquare, Trash2 } from "@/components/icons/icon"
import { ListLinkContext } from "@/components/list/list"
import { NoteList } from "@/components/notes/note-list"
import type { NoteItem } from "@/components/notes/note-list"
import type { GameDefinition } from "@/games/types"
import type { DataState } from "@/lib/db/react/data-state"
import type { MatchRecord, ScoutEntryRecord } from "@/lib/db/types"
import { matchSummary, summaryColumns } from "@/lib/metrics/match-summary"
import { cn } from "@/lib/utils"
import { longMatchLabel, shortMatchLabel } from "@/utils/match-label"
import type { TeamDetail } from "../api/get-teams"
import { TEAM_VIEWS } from "../types/team-views"
import type { TeamViewKey } from "../types/team-views"

const VIEW_LABEL: Record<TeamViewKey, string> = {
  overview: "Overview",
  matches: "Matches",
  notes: "Notes",
}

export function TeamDetailView({
  state,
  teamNumber,
  view,
  onViewChange,
  photoUrl,
  bottom,
  children,
}: {
  state: DataState<TeamDetail>
  teamNumber: number
  view: TeamViewKey
  onViewChange: (view: TeamViewKey) => void
  /** the newest robot photo; no placeholder without one (criterion 17) */
  photoUrl?: string | null
  /** the thumb-zone action bar, composed by the route */
  bottom?: ReactNode
  /** the selected sub-view, composed by the route */
  children: ReactNode
}) {
  return (
    <DataView state={state} size="page">
      <DataView.Loading label="Loading team…">
        <SkeletonRows rows={5} rowClassName="h-14" />
      </DataView.Loading>
      <DataView.Missing
        not-found={{
          title: `Team ${teamNumber} isn’t at this event`,
          description: "Check the team number in the link.",
        }}
        not-synced={{
          title: "Team list not downloaded yet",
          description: "Connect to download it.",
        }}
      />
      <DataView.Error title="Couldn’t load this team." />
      <DataView.Success>
        {(team: TeamDetail) => (
          <div className="flex flex-col gap-4">
            <header className="flex items-center gap-3">
              {photoUrl ? (
                <a
                  href="#robot-photos"
                  onClick={(e) => {
                    e.preventDefault()
                    onViewChange("overview")
                    requestAnimationFrame(() =>
                      document
                        .getElementById("robot")
                        ?.scrollIntoView({ behavior: "smooth" })
                    )
                  }}
                  className="shrink-0 rounded-xl"
                >
                  <img
                    src={photoUrl}
                    alt={`Team ${team.teamNumber}’s robot. Show photos`}
                    width={56}
                    height={56}
                    className="size-14 rounded-xl bg-muted object-cover"
                  />
                </a>
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-title-3 font-semibold text-balance">
                  {team.nickname}
                </p>
                <p className="text-footnote text-muted-foreground tabular-nums">
                  {[
                    team.rank ? `Rank ${team.rank}` : "Unranked",
                    team.record
                      ? `${team.record.wins}-${team.record.losses}-${team.record.ties}`
                      : null,
                    team.city,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </header>
            <Segmented
              label="Team view"
              value={view}
              onValueChange={onViewChange}
              options={TEAM_VIEWS.map((v) => ({
                value: v,
                label: VIEW_LABEL[v],
              }))}
            />
            <div role="tabpanel" aria-label={VIEW_LABEL[view]}>
              {children}
            </div>
            {bottom}
          </div>
        )}
      </DataView.Success>
    </DataView>
  )
}

const time = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
})

function allianceOf(m: MatchRecord, team: number): "red" | "blue" {
  return m.alliances.red.teamNumbers.includes(team) ? "red" : "blue"
}

function resultOf(m: MatchRecord, alliance: "red" | "blue") {
  const ours = m.alliances[alliance].score
  const theirs = m.alliances[alliance === "red" ? "blue" : "red"].score
  if (typeof ours !== "number" || typeof theirs !== "number") return null
  const outcome =
    m.winningAlliance === alliance
      ? "W"
      : m.winningAlliance === null
        ? "T"
        : "L"
  const word = { W: "Won", L: "Lost", T: "Tied" }[outcome]
  return {
    short: `${outcome} ${ours}–${theirs}`,
    long: `${word} ${ours} to ${theirs}`,
  }
}

function Stripe({ alliance }: { alliance: "red" | "blue" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-9 w-1 shrink-0 rounded-full",
        alliance === "red" ? "bg-alliance-red" : "bg-alliance-blue"
      )}
    />
  )
}

export function TeamMatches({
  game,
  state,
  teamNumber,
  entries,
  onScout,
}: {
  game: GameDefinition
  state: DataState<ReadonlyArray<MatchRecord>>
  teamNumber: number
  /** this team's scouting entries at the event */
  entries: ReadonlyArray<ScoutEntryRecord>
  /** scout this team in an upcoming match (scouters) */
  onScout?: (matchKey: string) => void
}) {
  const renderLink = use(ListLinkContext)
  const columns = summaryColumns(game)
  return (
    <DataView state={state}>
      <DataView.Empty
        icon={CalendarDays}
        title="No matches for this team yet"
      />
      <DataView.Error title="Couldn’t load this team’s matches." />
      <DataView.Success>
        {(matches: ReadonlyArray<MatchRecord>) => {
          const played = matches.flatMap((m) => {
            const alliance = allianceOf(m, teamNumber)
            const result = resultOf(m, alliance)
            return result ? [{ m, alliance, result }] : []
          })
          const upcoming = matches.filter(
            (m) => resultOf(m, allianceOf(m, teamNumber)) === null
          )
          return (
            <div className="flex flex-col gap-6">
              {played.length > 0 ? (
                <section aria-labelledby="team-played">
                  <h2
                    id="team-played"
                    className="mb-1.5 px-1 text-footnote text-muted-foreground uppercase"
                  >
                    Played
                  </h2>
                  <div className="overflow-hidden rounded-2xl bg-card shadow-xs">
                    <table className="w-full text-subhead">
                      <thead>
                        <tr className="border-b border-border text-caption-1 text-muted-foreground">
                          <th
                            scope="col"
                            className="py-2 ps-4 text-start font-normal"
                          >
                            Match
                          </th>
                          {columns.map((c) => (
                            <th
                              key={c.id}
                              scope="col"
                              className="px-1 py-2 text-end font-normal last:pe-4"
                            >
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {played.map(({ m, alliance, result }) => {
                          const cells = matchSummary(game, m.key, entries)
                          return (
                            <tr
                              key={m.key}
                              className="relative border-b border-border last:border-b-0 active:bg-muted"
                            >
                              <th
                                scope="row"
                                className="py-2 ps-4 text-start font-normal"
                              >
                                <span className="flex items-center gap-2">
                                  <Stripe alliance={alliance} />
                                  <span className="flex flex-col">
                                    {renderLink({
                                      href: `/matches/${m.key}`,
                                      className:
                                        "font-heading text-headline after:absolute after:inset-0",
                                      children: (
                                        <>
                                          <span aria-hidden>
                                            {shortMatchLabel(m)}
                                          </span>
                                          <span className="sr-only">
                                            {`${longMatchLabel(m)}, ${alliance === "red" ? "Red" : "Blue"} alliance, ${result.long}`}
                                          </span>
                                        </>
                                      ),
                                    })}
                                    <span
                                      aria-hidden
                                      className="text-caption-1 text-muted-foreground tabular-nums"
                                    >
                                      {result.short}
                                    </span>
                                  </span>
                                </span>
                              </th>
                              {cells ? (
                                cells.map((c) => (
                                  <td
                                    key={c.id}
                                    className="px-1 py-2 text-end tabular-nums last:pe-4"
                                  >
                                    {c.value}
                                  </td>
                                ))
                              ) : (
                                <td
                                  colSpan={Math.max(columns.length, 1)}
                                  className="py-2 pe-4 text-end text-muted-foreground"
                                >
                                  Not scouted
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
              {upcoming.length > 0 ? (
                <section aria-labelledby="team-upcoming">
                  <h2
                    id="team-upcoming"
                    className="mb-1.5 px-1 text-footnote text-muted-foreground uppercase"
                  >
                    Upcoming
                  </h2>
                  <ul className="overflow-hidden rounded-2xl bg-card shadow-xs">
                    {upcoming.map((m) => {
                      const alliance = allianceOf(m, teamNumber)
                      return (
                        <li
                          key={m.key}
                          className="relative flex min-h-14 items-center gap-3 border-b border-border ps-4 pe-2 last:border-b-0 active:bg-muted"
                        >
                          <Stripe alliance={alliance} />
                          {renderLink({
                            href: `/matches/${m.key}`,
                            className:
                              "w-12 font-heading text-headline after:absolute after:inset-0",
                            children: (
                              <>
                                <span aria-hidden>{shortMatchLabel(m)}</span>
                                <span className="sr-only">
                                  {`${longMatchLabel(m)}, ${alliance === "red" ? "Red" : "Blue"} alliance`}
                                </span>
                              </>
                            ),
                          })}
                          <span className="flex-1 text-subhead text-muted-foreground">
                            {m.scheduledTime
                              ? time.format(m.scheduledTime)
                              : "Time TBD"}
                          </span>
                          {onScout ? (
                            <button
                              type="button"
                              onClick={() => onScout(m.key)}
                              aria-label={`Scout ${teamNumber} in ${longMatchLabel(m)}`}
                              className="relative z-10 min-h-11 rounded-full px-3 text-subhead font-semibold text-primary active:bg-muted"
                            >
                              Scout
                            </button>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ) : null}
            </div>
          )
        }}
      </DataView.Success>
    </DataView>
  )
}

export type NotesFilter = "all" | "team" | "private"

export function TeamNotes({
  state,
  filter,
  onFilterChange,
  canWritePrivate,
  composer,
  onDelete,
}: {
  state: DataState<ReadonlyArray<NoteItem>>
  filter: NotesFilter
  onFilterChange: (f: NotesFilter) => void
  /** guests have no private notes (ADR-025) */
  canWritePrivate: boolean
  composer?: ReactNode
  /** delete one of my notes */
  onDelete?: (id: string) => void
}) {
  const filtered: DataState<ReadonlyArray<NoteItem>> =
    state.status === "success"
      ? (() => {
          const data = state.data.filter((n) =>
            filter === "all"
              ? true
              : filter === "private"
                ? n.private
                : !n.private
          )
          return data.length ? { ...state, data } : { status: "empty" }
        })()
      : state
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Which notes"
        value={filter}
        onValueChange={onFilterChange}
        options={[
          { value: "all", label: "All" },
          { value: "team", label: "Team" },
          ...(canWritePrivate
            ? [{ value: "private" as const, label: "My Private" }]
            : []),
        ]}
      />
      {composer}
      <DataView state={filtered}>
        <DataView.Empty
          icon={MessageSquare}
          title={filter === "private" ? "No private notes yet" : "No notes yet"}
        />
        <DataView.Error title="Couldn’t load notes." />
        <DataView.Success>
          {(notes: ReadonlyArray<NoteItem>) => (
            <NoteList
              notes={notes}
              {...(onDelete
                ? {
                    actions: (n: NoteItem) =>
                      n.mine ? (
                        <button
                          type="button"
                          aria-label="Delete note"
                          onClick={() => onDelete(n.id)}
                          className="inline-flex size-11 items-center justify-center rounded-full text-destructive"
                        >
                          <Trash2 aria-hidden size={16} />
                        </button>
                      ) : null,
                  }
                : {})}
            />
          )}
        </DataView.Success>
      </DataView>
    </div>
  )
}
