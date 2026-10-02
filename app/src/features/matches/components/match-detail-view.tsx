// One match (matches.md M2): when it plays or how it ended, both alliances with their teams, and
// the notes on it. Alliance cards use the red/blue tokens plus the words (ADR-044).
import { use } from "react"
import type { ReactNode } from "react"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { ChevronRight, MessageSquare } from "@/components/icons/icon"
import { ListLinkContext } from "@/components/list/list"
import { NoteList } from "@/components/notes/note-list"
import type { NoteItem } from "@/components/notes/note-list"
import type { DataState } from "@/lib/db/react/data-state"
import type { MatchRecord } from "@/lib/db/types"
import { cn } from "@/lib/utils"
import type { MatchTeamInfo } from "../api/get-matches"
import { NO_COVERAGE, STATIONS, toMatchView } from "../utils/match-view"
import type { Coverage, MatchView } from "../utils/match-view"
import { countdown, formatMatchTime } from "./match-row"

export interface MatchDetailViewProps {
  state: DataState<MatchRecord>
  /** shown when the match isn't in this event: "Qual 99" */
  label: string
  teams: ReadonlyMap<number, MatchTeamInfo>
  coverage: Coverage | undefined
  notes: DataState<ReadonlyArray<NoteItem>>
  showCoverage: boolean
  ourTeam: number | null
  now: number
  /** the Scout a Robot button (scouters), composed by the route */
  actions?: ReactNode
}

function statusLine(m: MatchView, now: number): string {
  if (m.played) return `Played · ${formatMatchTime(m.time)}`
  if (m.onField) return "On the field now"
  if (m.status === "queuing") return `Queuing · ${formatMatchTime(m.time)}`
  const c = countdown(m.time, now)
  const at = formatMatchTime(m.time)
  return `${m.predicted ? "Expected" : "Scheduled"} ${at}${c !== at ? ` · ${c}` : ""}`
}

function Score({ m }: { m: MatchView }) {
  if (!m.played) return null
  if (m.redScore === null || m.blueScore === null)
    return (
      <p className="text-subhead text-muted-foreground">
        Score not posted yet.
      </p>
    )
  return (
    <p className="flex items-baseline gap-3 font-heading text-title-1 tabular-nums">
      <span
        className={cn("text-alliance-red", m.winner === "red" && "font-bold")}
      >
        <span className="sr-only">Red </span>
        {m.redScore}
      </span>
      <span aria-hidden className="text-muted-foreground">
        –
      </span>
      <span
        className={cn("text-alliance-blue", m.winner === "blue" && "font-bold")}
      >
        <span className="sr-only">Blue </span>
        {m.blueScore}
      </span>
      <span className="text-subhead text-muted-foreground">
        {m.winner ? `${m.winner === "red" ? "Red" : "Blue"} won` : "Tie"}
      </span>
    </p>
  )
}

function AllianceCard({
  color,
  teams,
  info,
  coverage,
  offset,
  showCoverage,
  ourTeam,
}: {
  color: "red" | "blue"
  teams: ReadonlyArray<number>
  info: ReadonlyMap<number, MatchTeamInfo>
  coverage: Coverage
  offset: number
  showCoverage: boolean
  ourTeam: number | null
}) {
  const renderLink = use(ListLinkContext)
  const name = color === "red" ? "Red Alliance" : "Blue Alliance"
  return (
    <section
      aria-label={name}
      className={cn(
        "overflow-hidden rounded-2xl border-s-4",
        color === "red"
          ? "border-alliance-red bg-alliance-red-muted"
          : "border-alliance-blue bg-alliance-blue-muted"
      )}
    >
      <h2 className="px-4 pt-3 pb-1 text-footnote font-semibold uppercase">
        {name}
      </h2>
      <ul>
        {teams.map((t, i) => {
          const team = info.get(t)
          const n = coverage[offset + i] ?? 0
          return (
            <li
              key={t}
              className="relative flex min-h-14 items-center gap-3 px-4 py-2 active:bg-foreground/5"
            >
              <span className="w-12 font-heading text-headline tabular-nums">
                {renderLink({
                  href: `/teams/${t}`,
                  className: "after:absolute after:inset-0",
                  children: (
                    <span
                      className={cn(
                        t === ourTeam && "underline underline-offset-2"
                      )}
                    >
                      {t}
                    </span>
                  ),
                })}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body">
                  {team?.nickname ?? `Team ${t}`}
                </span>
                <span className="text-footnote text-muted-foreground">
                  {STATIONS[offset + i]
                    ?.replace(/(\d)/, " $1")
                    .replace(/^./, (c) => c.toUpperCase())}
                  {team?.rank ? ` · Rank ${team.rank}` : ""}
                  {showCoverage
                    ? ` · ${n === 0 ? "Not scouted" : n === 1 ? "1 entry" : `${n} entries`}`
                    : ""}
                </span>
              </span>
              <ChevronRight
                aria-hidden
                size={18}
                className="text-muted-foreground/60"
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function MatchDetailView({
  state,
  label,
  teams,
  coverage,
  notes,
  showCoverage,
  ourTeam,
  now,
  actions,
}: MatchDetailViewProps) {
  return (
    <DataView state={state} size="page">
      <DataView.Loading label="Loading match…">
        <SkeletonRows rows={4} rowClassName="h-14" />
      </DataView.Loading>
      <DataView.Missing
        not-found={{
          title: `${label} isn’t in this event`,
          description: "Check the match number in the link.",
        }}
        not-synced={{
          title: "Match schedule not downloaded yet",
          description: "Connect to download it.",
        }}
      />
      <DataView.Error title="Couldn’t load this match." />
      <DataView.Success>
        {(record: MatchRecord) => {
          const m = toMatchView(record, coverage ?? NO_COVERAGE, now)
          return (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-subhead text-muted-foreground">
                  {statusLine(m, now)}
                </p>
                <Score m={m} />
              </div>
              {actions}
              <AllianceCard
                color="red"
                teams={m.red}
                info={teams}
                coverage={m.coverage}
                offset={0}
                showCoverage={showCoverage}
                ourTeam={ourTeam}
              />
              <AllianceCard
                color="blue"
                teams={m.blue}
                info={teams}
                coverage={m.coverage}
                offset={3}
                showCoverage={showCoverage}
                ourTeam={ourTeam}
              />
              <section aria-labelledby="match-notes">
                <h2
                  id="match-notes"
                  className="mt-2 mb-1.5 px-1 text-footnote text-muted-foreground uppercase"
                >
                  Notes
                </h2>
                <DataView state={notes}>
                  <DataView.Empty
                    icon={MessageSquare}
                    title="No notes on this match yet"
                  />
                  <DataView.Error title="Couldn’t load notes." />
                  <DataView.Success>
                    {(list: ReadonlyArray<NoteItem>) => (
                      <NoteList notes={list} />
                    )}
                  </DataView.Success>
                </DataView>
              </section>
            </div>
          )
        }}
      </DataView.Success>
    </DataView>
  )
}
