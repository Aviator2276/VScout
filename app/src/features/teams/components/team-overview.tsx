// T2 Overview (teams.md, ADR-078): how good the robot is and whether it's improving, first. Stat tiles
// per game metric with event rank and a last-4 trend, capability chips, the robot (pit + post answers),
// a notes preview, then event and external values that exist. Each section is its own DataView.
import { useState } from "react"
import type { ReactNode } from "react"
import { Segmented } from "@/components/controls/segmented"
import { DataView } from "@/components/data-view/data-view"
import {
  ArrowDown,
  ArrowUp,
  Camera,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Eye,
  MessageSquare,
} from "@/components/icons/icon"
import { List } from "@/components/list/list"
import { NoteList } from "@/components/notes/note-list"
import type { NoteItem } from "@/components/notes/note-list"
import { capabilityValueLabel } from "@/games/kit/capability-label"
import { t } from "@/games/kit/labels"
import type { GameDefinition, MetricDef } from "@/games/types"
import type { DataState } from "@/lib/db/react/data-state"
import type { PostScoutingRecord } from "@/lib/db/types"
import type {
  MetricWindow,
  TeamMetrics,
} from "@/lib/metrics/event-team-metrics"
import { formatMetric, formatValue } from "@/lib/metrics/format-metric"
import {
  formatRank,
  metricRank,
  metricTrend,
} from "@/lib/metrics/metric-standing"
import { cn } from "@/lib/utils"
import type { TeamDetail, TeamPit } from "../api/get-teams"
import { summarize } from "../utils/field-summary"
import { drivetrainName } from "./team-list-view"

const CONFIDENCE = {
  low: "low confidence",
  medium: "medium confidence",
  high: "high confidence",
}

const matches = (n: number) => `${n} ${n === 1 ? "match" : "matches"}`

function StatTile({
  game,
  def,
  teamNumber,
  metrics,
  recent,
  byTeam,
}: {
  game: GameDefinition
  def: MetricDef
  teamNumber: number
  metrics: TeamMetrics | undefined
  recent: TeamMetrics | undefined
  byTeam: ReadonlyMap<number, TeamMetrics> | undefined
}) {
  const cell = metrics?.metrics[def.id]
  const f = formatMetric(def.format, cell)
  const rank = metricRank(byTeam, def, teamNumber)
  const trend = recent ? metricTrend(def, cell, recent.metrics[def.id]) : null
  const label = t(game, def.label)
  const context =
    cell && !("error" in cell) && cell.value !== null
      ? [rank ? formatRank(rank) : null, matches(cell.sampleSize)]
          .filter(Boolean)
          .join(" · ")
      : f.label
  const spoken = [
    `${label}: ${f.missing ? f.label : f.text}`,
    f.missing ? null : context,
    cell && !("error" in cell) && cell.value !== null
      ? CONFIDENCE[cell.confidence]
      : null,
    trend?.text,
  ]
    .filter(Boolean)
    .join(", ")
  return (
    <li
      aria-label={spoken}
      className="flex min-h-28 flex-col gap-0.5 rounded-2xl bg-card p-3 shadow-xs"
    >
      <span aria-hidden className="text-footnote text-muted-foreground">
        {label}
      </span>
      <span
        aria-hidden
        className={cn(
          "font-heading text-title-2",
          f.missing && "text-muted-foreground"
        )}
      >
        {f.text}
      </span>
      <span aria-hidden className="text-caption-1 text-muted-foreground">
        {context}
      </span>
      {trend ? (
        <span
          aria-hidden
          className={cn(
            "mt-auto flex items-center gap-1 text-caption-1 font-medium",
            trend.good ? "text-success" : "text-destructive"
          )}
        >
          {trend.direction === "up" ? (
            <ArrowUp size={12} strokeWidth={2.5} />
          ) : (
            <ArrowDown size={12} strokeWidth={2.5} />
          )}
          {trend.text}
        </span>
      ) : null}
    </li>
  )
}

function CapabilityChips({
  game,
  metrics,
}: {
  game: GameDefinition
  metrics: TeamMetrics | undefined
}) {
  return (
    <section aria-labelledby="team-caps" className="mt-6">
      <h2
        id="team-caps"
        className="mb-1.5 px-1 text-footnote text-muted-foreground uppercase"
      >
        Capabilities
      </h2>
      <ul className="flex flex-wrap gap-2">
        {game.capabilities.map((c) => {
          const state = metrics?.capabilities[c.id]
          const value =
            c.display === "value"
              ? capabilityValueLabel(game, c, metrics?.capabilityValues[c.id])
              : null
          const claimed = state?.claimed ?? false
          const observed = state?.observed ?? false
          const known = value !== null || claimed || observed
          const name = t(game, c.label)
          const text =
            c.display === "value"
              ? `${name} · ${value ?? "Unknown"}`
              : known
                ? name
                : `${name} · Unknown`
          const sources = [
            claimed || (value !== null && !observed) ? "pit says so" : null,
            observed ? "seen in a match" : null,
          ].filter(Boolean)
          return (
            <li
              key={c.id}
              aria-label={`${text}${sources.length ? `, ${sources.join(", ")}` : ""}`}
              className={cn(
                "flex min-h-9 items-center gap-1.5 rounded-full px-3 text-subhead",
                known
                  ? "bg-card text-foreground shadow-xs"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <span aria-hidden>{text}</span>
              <span
                aria-hidden
                className="flex items-center gap-1 text-muted-foreground"
              >
                {sources.includes("pit says so") ? (
                  <ClipboardCheck size={14} />
                ) : null}
                {observed ? <Eye size={14} /> : null}
                {!known ? <CircleHelp size={14} /> : null}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 px-1 text-caption-1 text-muted-foreground">
        <span className="flex items-center gap-1">
          <ClipboardCheck aria-hidden size={12} /> Pit says so
        </span>
        <span className="flex items-center gap-1">
          <Eye aria-hidden size={12} /> Seen in a match
        </span>
      </p>
    </section>
  )
}

/** A row that shows or hides the lines under it (HIG: progressive disclosure). */
function Disclosure({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <List.Row
        title={title}
        detail={
          <span className="flex items-center gap-1 tabular-nums">
            {count}
            <ChevronDown
              aria-hidden
              size={16}
              className={cn(
                "transition-[rotate] motion-reduce:transition-none",
                open && "rotate-180"
              )}
            />
          </span>
        }
        onSelect={() => setOpen((o) => !o)}
      />
      {open ? children : null}
    </>
  )
}

function RobotSection({
  game,
  pit,
  post,
  actions,
}: {
  game: GameDefinition
  pit: DataState<TeamPit>
  post: DataState<ReadonlyArray<PostScoutingRecord>>
  actions?: ReactNode
}) {
  let rows: ReactNode
  if (pit.status === "success") {
    const { entry, photos } = pit.data
    const lines = summarize(game, game.pitForm, entry.data)
    rows = (
      <>
        {photos.length > 0 ? (
          <li className="px-4 py-2">
            <ul
              id="robot-photos"
              className="flex gap-2 overflow-x-auto"
              aria-label="Robot photos"
            >
              {photos.map((p, i) => (
                <li key={p.id} className="shrink-0">
                  <img
                    src={p.thumbUrl ?? p.url}
                    alt={`Robot photo ${i + 1}`}
                    width={128}
                    height={96}
                    loading="lazy"
                    className="h-24 w-32 rounded-xl bg-muted object-cover"
                  />
                </li>
              ))}
            </ul>
          </li>
        ) : null}
        <List.Row
          title="Drivetrain"
          detail={drivetrainName(entry.robot.drivetrain) ?? "Unknown"}
        />
        {entry.robot.widthIn ? (
          <List.Row
            title="Size"
            detail={`${entry.robot.widthIn} × ${entry.robot.lengthIn ?? "?"} in`}
          />
        ) : null}
        {entry.robot.weightLb ? (
          <List.Row title="Weight" detail={`${entry.robot.weightLb} lb`} />
        ) : null}
        {lines.length > 0 ? (
          <Disclosure title="Pit Answers" count={lines.length}>
            {lines.map((l) => (
              <List.Row key={l.id} title={l.label} detail={l.value} />
            ))}
          </Disclosure>
        ) : null}
      </>
    )
  } else if (pit.status === "missing" || pit.status === "empty") {
    rows = (
      <List.Row
        title="Not pit scouted yet"
        leading={<Camera aria-hidden size={18} />}
      />
    )
  }
  const latest = post.status === "success" ? post.data[0] : undefined
  const earlier = post.status === "success" ? post.data.slice(1) : []
  return (
    <div id="robot" className="scroll-mt-16">
      {rows === undefined ? (
        <section aria-label="Robot" className="mt-6">
          <DataView state={pit} size="section">
            <DataView.Error title="Couldn’t load pit scouting." />
          </DataView>
        </section>
      ) : (
        <List.Section title="Robot">
          {rows}
          {actions}
        </List.Section>
      )}
      {latest ? (
        <List.Section title="Post-Scouting">
          {summarize(game, game.postForm, latest.data).map((l) => (
            <List.Row key={l.id} title={l.label} detail={l.value} />
          ))}
          {earlier.length > 0 ? (
            <Disclosure title="Earlier Post-Scouting" count={earlier.length}>
              {earlier.flatMap((e) =>
                summarize(game, game.postForm, e.data).map((l) => (
                  <List.Row
                    key={`${e.id}-${l.id}`}
                    title={l.label}
                    detail={l.value}
                  />
                ))
              )}
            </Disclosure>
          ) : null}
        </List.Section>
      ) : post.status === "error" ? (
        <section aria-label="Post-Scouting" className="mt-6">
          <DataView state={post} size="section">
            <DataView.Error title="Couldn’t load post-scouting." />
          </DataView>
        </section>
      ) : null}
    </div>
  )
}

function NotesPreview({
  notes,
  onAllNotes,
}: {
  notes: DataState<ReadonlyArray<NoteItem>>
  onAllNotes: () => void
}) {
  return (
    <section aria-labelledby="team-notes-preview" className="mt-6">
      <h2
        id="team-notes-preview"
        className="mb-1.5 px-1 text-footnote text-muted-foreground uppercase"
      >
        Notes
      </h2>
      <DataView state={notes} size="inline">
        <DataView.Empty icon={MessageSquare} title="No notes yet" />
        <DataView.Error title="Couldn’t load notes." />
        <DataView.Success>
          {(list: ReadonlyArray<NoteItem>) => (
            <div className="flex flex-col gap-2">
              <NoteList notes={list.slice(0, 2)} />
              <button
                type="button"
                onClick={onAllNotes}
                className="flex min-h-11 items-center justify-between rounded-2xl bg-card px-4 text-body shadow-xs active:bg-muted"
              >
                All Notes ({list.length})
                <ChevronRight
                  aria-hidden
                  size={18}
                  className="text-muted-foreground/60"
                />
              </button>
            </div>
          )}
        </DataView.Success>
      </DataView>
    </section>
  )
}

export function TeamOverview({
  game,
  team,
  window,
  onWindowChange,
  metrics,
  recent,
  byTeam,
  pit,
  post,
  notes,
  onAllNotes,
  robotActions,
}: {
  game: GameDefinition
  team: TeamDetail
  window: MetricWindow
  onWindowChange: (w: MetricWindow) => void
  /** this team, in the selected window */
  metrics: TeamMetrics | undefined
  /** this team over its last 4 matches; passed with All Matches to show trends */
  recent: TeamMetrics | undefined
  /** every team in the selected window, for ranks */
  byTeam: ReadonlyMap<number, TeamMetrics> | undefined
  pit: DataState<TeamPit>
  post: DataState<ReadonlyArray<PostScoutingRecord>>
  notes: DataState<ReadonlyArray<NoteItem>>
  onAllNotes: () => void
  /** Pit Scout / Post-Scout rows for scouters, composed by the route */
  robotActions?: ReactNode
}) {
  const externals = game.teamListColumns.flatMap((c) => {
    if (!("external" in c.source)) return []
    const v = metrics?.external[c.source.external]
    return v === null || v === undefined
      ? []
      : [
          {
            id: c.id,
            label: t(game, c.label),
            value: formatValue("external", v),
          },
        ]
  })
  const event = [
    team.rankingPoints !== null
      ? { title: "Ranking Points", detail: String(team.rankingPoints) }
      : null,
    team.pitLocation ? { title: "Pit", detail: team.pitLocation } : null,
  ].filter((r) => r !== null)
  return (
    <div>
      <section aria-labelledby="team-metrics" className="flex flex-col gap-2">
        <h2 id="team-metrics" className="sr-only">
          Metrics
        </h2>
        <Segmented
          label="Which matches"
          value={window}
          onValueChange={onWindowChange}
          options={[
            { value: "all", label: "All Matches" },
            { value: "recent", label: "Last 4" },
          ]}
        />
        <ul className="grid grid-cols-2 gap-3">
          {game.metrics.map((def) => (
            <StatTile
              key={def.id}
              game={game}
              def={def}
              teamNumber={team.teamNumber}
              metrics={metrics}
              recent={window === "all" ? recent : undefined}
              byTeam={byTeam}
            />
          ))}
        </ul>
        <p className="px-1 text-caption-1 text-muted-foreground">
          From this event’s scouting. Rank is among teams with enough data.
        </p>
      </section>
      <CapabilityChips game={game} metrics={metrics} />
      <RobotSection game={game} pit={pit} post={post} actions={robotActions} />
      <NotesPreview notes={notes} onAllNotes={onAllNotes} />
      {event.length > 0 ? (
        <List.Section title="Event">
          {event.map((r) => (
            <List.Row key={r.title} title={r.title} detail={r.detail} />
          ))}
        </List.Section>
      ) : null}
      {externals.length > 0 ? (
        <List.Section title="External">
          {externals.map((e) => (
            <List.Row
              key={e.id}
              title={e.label}
              detail={<span className="tabular-nums">{e.value}</span>}
            />
          ))}
        </List.Section>
      ) : null}
    </div>
  )
}
