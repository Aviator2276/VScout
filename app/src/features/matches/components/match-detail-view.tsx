// One match (matches.md M2, ADR-078): when it plays or how it ended (or the predicted score), what
// each robot did in it or brings to it, what to watch for, and the notes. Alliance colour is a stripe
// next to the word (ADR-044), on neutral rows.
import { use } from "react"
import type { ReactNode } from "react"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import {
  ChevronRight,
  MessageSquare,
  TriangleAlert,
} from "@/components/icons/icon"
import { ListLinkContext } from "@/components/list/list"
import { NoteList } from "@/components/notes/note-list"
import type { NoteItem } from "@/components/notes/note-list"
import { capabilityValueLabel } from "@/games/kit/capability-label"
import { t } from "@/games/kit/labels"
import type { GameDefinition } from "@/games/types"
import type { DataState } from "@/lib/db/react/data-state"
import type { MatchRecord, ScoutEntryRecord } from "@/lib/db/types"
import type { TeamMetrics } from "@/lib/metrics/event-team-metrics"
import { formatMetric, formatValue } from "@/lib/metrics/format-metric"
import {
  breakdownRows,
  predictScore,
  watchFor,
} from "@/lib/metrics/match-outlook"
import type { BreakdownRow } from "@/lib/metrics/match-outlook"
import { matchSummary, summaryColumns } from "@/lib/metrics/match-summary"
import { cn } from "@/lib/utils"
import type { MatchTeamInfo } from "../api/get-matches"
import { NO_COVERAGE, toMatchView } from "../utils/match-view"
import type { Coverage, MatchView } from "../utils/match-view"
import { countdown, formatMatchTime } from "./match-row"

export interface MatchDetailViewProps {
  game: GameDefinition
  state: DataState<MatchRecord>
  /** shown when the match isn't in this event: "Qual 99" */
  label: string
  teams: ReadonlyMap<number, MatchTeamInfo>
  coverage: Coverage | undefined
  /** this match's scouting entries (played lines) */
  entries: ReadonlyArray<ScoutEntryRecord>
  /** every team's metrics (upcoming lines, prediction, Watch For) */
  metrics: ReadonlyMap<number, TeamMetrics> | undefined
  notes: DataState<ReadonlyArray<NoteItem>>
  showCoverage: boolean
  ourTeam: number | null
  now: number
  /** Pre-Match Strategy, shown before the match */
  strategyHref?: string
  /** the thumb-zone Scout a Robot bar (scouters), shown only before the match */
  scoutAction?: ReactNode
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

const SIDE = { red: "Red", blue: "Blue" } as const

interface Column {
  id: string
  label: string
}

/** Columns and values from the game's first pre-match section (Reliability, Auto, EPA). */
function outlookColumns(game: GameDefinition): Array<Column> {
  return (game.prematchCard[0]?.show ?? []).flatMap((item) => {
    if ("metric" in item) {
      const def = game.metrics.find((d) => d.id === item.metric)
      return def ? [{ id: `m:${def.id}`, label: t(game, def.label) }] : []
    }
    if ("external" in item) {
      const col = game.teamListColumns.find(
        (c) => "external" in c.source && c.source.external === item.external
      )
      return [
        {
          id: `x:${item.external}`,
          label: col ? t(game, col.label) : item.external,
        },
      ]
    }
    if ("capability" in item) {
      const cap = game.capabilities.find((c) => c.id === item.capability)
      return cap ? [{ id: `c:${cap.id}`, label: t(game, cap.label) }] : []
    }
    return []
  })
}

function outlookValue(
  game: GameDefinition,
  m: TeamMetrics | undefined,
  id: string
): string {
  const [kind, key = ""] = id.split(/:(.*)/s)
  if (!m) return "—"
  if (kind === "m") {
    const def = game.metrics.find((d) => d.id === key)
    return def ? formatMetric(def.format, m.metrics[key]).text : "—"
  }
  if (kind === "x") {
    const v = m.external[key]
    return v === null || v === undefined ? "—" : formatValue("external", v)
  }
  const cap = game.capabilities.find((c) => c.id === key)
  return (
    (cap && capabilityValueLabel(game, cap, m.capabilityValues[key])) ?? "—"
  )
}

function RobotRows({
  color,
  teams,
  offset,
  info,
  coverage,
  showCoverage,
  ourTeam,
  columns,
  cells,
}: {
  color: "red" | "blue"
  teams: ReadonlyArray<number>
  offset: number
  info: ReadonlyMap<number, MatchTeamInfo>
  coverage: Coverage
  showCoverage: boolean
  ourTeam: number | null
  columns: ReadonlyArray<Column>
  /** one value per column, or null for "Not scouted" */
  cells: (team: number) => ReadonlyArray<string> | null
}) {
  const renderLink = use(ListLinkContext)
  return (
    <tbody aria-label={`${SIDE[color]} Alliance`}>
      <tr>
        <th
          scope="colgroup"
          colSpan={columns.length + 1}
          className="px-4 pt-3 pb-1 text-start text-footnote font-semibold uppercase"
        >
          {SIDE[color]} Alliance
        </th>
      </tr>
      {teams.map((num, i) => {
        const team = info.get(num)
        const n = coverage[offset + i] ?? 0
        const values = cells(num)
        return (
          <tr
            key={num}
            className="relative border-t border-border active:bg-muted"
          >
            <th scope="row" className="py-2 ps-4 text-start font-normal">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "w-1 self-stretch rounded-full",
                    color === "red" ? "bg-alliance-red" : "bg-alliance-blue"
                  )}
                />
                <span className="flex min-w-0 flex-col">
                  {renderLink({
                    href: `/teams/${num}`,
                    className:
                      "font-heading text-headline tabular-nums after:absolute after:inset-0",
                    children: (
                      <span
                        className={cn(
                          num === ourTeam && "underline underline-offset-2"
                        )}
                      >
                        {num}
                      </span>
                    ),
                  })}
                  <span className="max-w-32 truncate text-caption-1">
                    {team?.nickname ?? `Team ${num}`}
                  </span>
                  <span className="text-caption-1 text-muted-foreground">
                    {[
                      team?.rank ? `Rank ${team.rank}` : null,
                      showCoverage
                        ? n === 0
                          ? "Not scouted"
                          : n === 1
                            ? "1 entry"
                            : `${n} entries`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </span>
            </th>
            {values ? (
              values.map((v, c) => (
                <td
                  key={columns[c]?.id ?? c}
                  className="px-1 py-2 text-end text-subhead tabular-nums last:pe-4"
                >
                  {v}
                </td>
              ))
            ) : (
              <td
                colSpan={Math.max(columns.length, 1)}
                className="py-2 pe-4 text-end text-subhead text-muted-foreground"
              >
                Not scouted
              </td>
            )}
          </tr>
        )
      })}
    </tbody>
  )
}

function Prediction({
  game,
  metrics,
  m,
}: {
  game: GameDefinition
  metrics: ReadonlyMap<number, TeamMetrics> | undefined
  m: MatchView
}) {
  const p = predictScore(game, metrics, m.red, m.blue)
  if (!p) return null
  const source = game.detailPage?.prediction?.external ?? ""
  const col = game.teamListColumns.find(
    (c) => "external" in c.source && c.source.external === source
  )
  return (
    <div className="flex flex-col">
      <p
        role="group"
        aria-label={`Predicted score: Red ${p.red}, Blue ${p.blue}`}
        className="flex items-baseline gap-3 font-heading text-title-2 tabular-nums"
      >
        <span
          aria-hidden
          className="font-sans text-subhead text-muted-foreground"
        >
          Predicted
        </span>
        <span aria-hidden className="text-alliance-red">
          {p.red}
        </span>
        <span aria-hidden className="text-muted-foreground">
          –
        </span>
        <span aria-hidden className="text-alliance-blue">
          {p.blue}
        </span>
      </p>
      <p className="text-caption-1 text-muted-foreground">
        From {col ? t(game, col.label) : source}
      </p>
    </div>
  )
}

function Breakdown({ rows }: { rows: ReadonlyArray<BreakdownRow> }) {
  if (rows.length === 0) return null
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-xs">
      <table className="w-full text-subhead">
        <caption className="sr-only">Score breakdown</caption>
        <thead>
          <tr className="border-b border-border text-caption-1 text-muted-foreground">
            <th scope="col" className="py-2 ps-4 text-start font-normal">
              <span className="sr-only">Points</span>
            </th>
            <th scope="col" className="px-2 py-2 text-end font-normal">
              Red
            </th>
            <th scope="col" className="py-2 pe-4 text-end font-normal">
              Blue
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border last:border-b-0">
              <th scope="row" className="py-2 ps-4 text-start font-normal">
                {r.label}
              </th>
              <td className="px-2 py-2 text-end tabular-nums">{r.red}</td>
              <td className="py-2 pe-4 text-end tabular-nums">{r.blue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MatchDetailView({
  game,
  state,
  label,
  teams,
  coverage,
  entries,
  metrics,
  notes,
  showCoverage,
  ourTeam,
  now,
  strategyHref,
  scoutAction,
}: MatchDetailViewProps) {
  const renderLink = use(ListLinkContext)
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
          const robots = [...m.red, ...m.blue]
          // a column no robot has a value for isn't shown (ui-patterns §4)
          const columns: Array<Column> = m.played
            ? summaryColumns(game)
            : outlookColumns(game).filter((c) =>
                robots.some(
                  (r) => outlookValue(game, metrics?.get(r), c.id) !== "—"
                )
              )
          const cells = (team: number) => {
            if (m.played) {
              const summary = matchSummary(
                game,
                record.key,
                entries.filter((e) => e.teamNumber === team)
              )
              return summary ? summary.map((c) => c.value) : null
            }
            const tm = metrics?.get(team)
            return columns.map((c) => outlookValue(game, tm, c.id))
          }
          const watch = m.played ? [] : watchFor(metrics, robots)
          const breakdown = m.played
            ? breakdownRows(game, record.scoreBreakdown)
            : []
          return (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-subhead text-muted-foreground">
                  {statusLine(m, now)}
                </p>
                {m.played ? (
                  <Score m={m} />
                ) : (
                  <Prediction game={game} metrics={metrics} m={m} />
                )}
              </div>
              <Breakdown rows={breakdown} />
              <section aria-labelledby="match-robots">
                <h2 id="match-robots" className="sr-only">
                  Robots
                </h2>
                <div className="overflow-hidden rounded-2xl bg-card shadow-xs">
                  <table className="w-full">
                    <thead>
                      <tr className="text-caption-1 text-muted-foreground">
                        <th
                          scope="col"
                          className="ps-4 pt-2 text-start font-normal"
                        >
                          Team
                        </th>
                        {columns.map((c) => (
                          <th
                            key={c.id}
                            scope="col"
                            className="px-1 pt-2 text-end font-normal last:pe-4"
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <RobotRows
                      color="red"
                      teams={m.red}
                      offset={0}
                      info={teams}
                      coverage={m.coverage}
                      showCoverage={showCoverage}
                      ourTeam={ourTeam}
                      columns={columns}
                      cells={cells}
                    />
                    <RobotRows
                      color="blue"
                      teams={m.blue}
                      offset={3}
                      info={teams}
                      coverage={m.coverage}
                      showCoverage={showCoverage}
                      ourTeam={ourTeam}
                      columns={columns}
                      cells={cells}
                    />
                  </table>
                </div>
                <p className="mt-1.5 px-1 text-caption-1 text-muted-foreground">
                  {m.played
                    ? "What each robot did in this match, from scouting."
                    : "From this event’s scouting so far."}
                </p>
              </section>
              {watch.length > 0 ? (
                <section aria-labelledby="match-watch">
                  <h2
                    id="match-watch"
                    className="mb-1.5 px-1 text-footnote text-muted-foreground uppercase"
                  >
                    Watch For
                  </h2>
                  <ul className="overflow-hidden rounded-2xl bg-card shadow-xs">
                    {watch.map((w) => (
                      <li
                        key={w}
                        className="flex min-h-11 items-center gap-3 border-b border-border px-4 py-2 text-subhead last:border-b-0"
                      >
                        <TriangleAlert
                          aria-hidden
                          size={16}
                          className="shrink-0 text-warning"
                        />
                        {w}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {strategyHref && !m.played ? (
                <div className="relative flex min-h-11 items-center justify-between rounded-2xl bg-card px-4 shadow-xs active:bg-muted">
                  {renderLink({
                    href: strategyHref,
                    className: "text-body after:absolute after:inset-0",
                    children: "Pre-Match Strategy",
                  })}
                  <ChevronRight
                    aria-hidden
                    size={18}
                    className="text-muted-foreground/60"
                  />
                </div>
              ) : null}
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
              {m.played ? null : scoutAction}
            </div>
          )
        }}
      </DataView.Success>
    </DataView>
  )
}
