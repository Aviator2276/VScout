// Pre-match strategy (scout-tab.md C). C1: pick a match (ours first). C2: one card per robot,
// opponents first then partners, with the sections the game's prematchCard lists. Alliance colors
// always come with the word (ADR-044).
import { use } from "react"
import type { ReactNode } from "react"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { CalendarDays } from "@/components/icons/icon"
import { ListLinkContext } from "@/components/list/list"
import { capabilityValueLabel } from "@/games/kit/capability-label"
import { t } from "@/games/kit/labels"
import type { GameDefinition } from "@/games/types"
import type { DataState } from "@/lib/db/react/data-state"
import type { MatchRecord } from "@/lib/db/types"
import type { TeamMetrics } from "@/lib/metrics/event-team-metrics"
import { formatMetric, formatValue } from "@/lib/metrics/format-metric"
import { cn } from "@/lib/utils"
import { longMatchLabel } from "@/utils/match-label"
import type { Briefing, BriefingTeam } from "../api/get-briefing"
import { summarizeField } from "../utils/field-summary"

const time = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
})

export function StrategyPickerView({
  state,
  ourTeam,
}: {
  state: DataState<ReadonlyArray<MatchRecord>>
  ourTeam: number | null
}) {
  const renderLink = use(ListLinkContext)
  return (
    <DataView state={state} size="page">
      <DataView.Loading label="Loading matches…">
        <SkeletonRows rows={5} rowClassName="h-14" />
      </DataView.Loading>
      <DataView.Empty icon={CalendarDays} title="No upcoming matches" />
      <DataView.Missing
        not-synced={{ title: "Match schedule not downloaded yet" }}
      />
      <DataView.Error title="Couldn’t load matches." />
      <DataView.Success>
        {(matches: ReadonlyArray<MatchRecord>) => {
          const ours =
            ourTeam === null
              ? []
              : matches.filter((m) => m.teamNumbers.includes(ourTeam))
          const row = (m: MatchRecord) => (
            <li
              key={m.key}
              className="relative flex min-h-14 items-center gap-3 rounded-2xl bg-card px-4 shadow-xs active:bg-muted"
            >
              {renderLink({
                href: `/scout/strategy/${m.key}`,
                className: "flex-1 text-body after:absolute after:inset-0",
                children: longMatchLabel(m),
              })}
              <span className="text-footnote text-muted-foreground">
                {m.scheduledTime ? time.format(m.scheduledTime) : "TBD"}
              </span>
            </li>
          )
          return (
            <div className="flex flex-col gap-4">
              {ourTeam === null ? (
                <p role="status" className="text-subhead text-muted-foreground">
                  No team number yet. Ask an admin, or pick any match below.
                </p>
              ) : (
                <section aria-labelledby="our-matches">
                  <h2
                    id="our-matches"
                    className="mb-1.5 px-1 text-footnote text-muted-foreground uppercase"
                  >
                    Our matches
                  </h2>
                  {ours.length ? (
                    <ul className="flex flex-col gap-2">{ours.map(row)}</ul>
                  ) : (
                    <p className="text-subhead text-muted-foreground">
                      No upcoming matches for {ourTeam}
                    </p>
                  )}
                </section>
              )}
              <section aria-labelledby="all-matches">
                <h2
                  id="all-matches"
                  className="mb-1.5 px-1 text-footnote text-muted-foreground uppercase"
                >
                  All upcoming
                </h2>
                <ul className="flex flex-col gap-2">
                  {matches.slice(0, 30).map(row)}
                </ul>
              </section>
            </div>
          )
        }}
      </DataView.Success>
    </DataView>
  )
}

const SIDE_LABEL = {
  us: "Us",
  partner: "Partner",
  opponent: "Opponent",
  red: "",
  blue: "",
} as const

function TeamCard({
  game,
  team,
  metrics,
}: {
  game: GameDefinition
  team: BriefingTeam
  metrics: TeamMetrics | undefined
}) {
  const renderLink = use(ListLinkContext)
  const red = team.alliance === "red"
  return (
    <article
      aria-label={`${red ? "Red" : "Blue"} ${SIDE_LABEL[team.side]} ${team.teamNumber}`.replace(
        /\s+/g,
        " "
      )}
      className={cn(
        "overflow-hidden rounded-2xl border-s-4 bg-card shadow-xs",
        red ? "border-alliance-red" : "border-alliance-blue"
      )}
    >
      <header
        className={cn(
          "relative flex items-center gap-2 px-3 py-2",
          red ? "bg-alliance-red-muted" : "bg-alliance-blue-muted"
        )}
      >
        <span className="text-caption-1 font-semibold uppercase">
          {red ? "Red" : "Blue"}
          {SIDE_LABEL[team.side] ? ` · ${SIDE_LABEL[team.side]}` : ""}
        </span>
        {renderLink({
          href: `/teams/${team.teamNumber}`,
          className:
            "font-heading text-headline tabular-nums after:absolute after:inset-0",
          children: team.teamNumber,
        })}
        <span className="min-w-0 flex-1 truncate text-subhead">
          {team.nickname}
        </span>
        <span className="text-footnote text-muted-foreground">
          {team.rank ? `#${team.rank}` : "Unranked"}
        </span>
      </header>
      <div className="flex flex-col gap-2 p-3">
        {game.prematchCard.map((section) => (
          <section key={section.id}>
            <h3 className="text-footnote text-muted-foreground uppercase">
              {t(game, section.title)}
            </h3>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-subhead">
              {section.show.map((item, i) => {
                let label = ""
                let value: string | null = null
                if ("metric" in item) {
                  const def = game.metrics.find((d) => d.id === item.metric)
                  label = def ? t(game, def.label) : item.metric
                  const cell = metrics?.metrics[item.metric]
                  const f = formatMetric(def?.format ?? "number", cell)
                  value =
                    cell && !("error" in cell) && cell.value !== null
                      ? `${f.text} (${cell.sampleSize})`
                      : f.label
                } else if ("capability" in item) {
                  const cap = game.capabilities.find(
                    (c) => c.id === item.capability
                  )
                  label = cap ? t(game, cap.label) : item.capability
                  const v = metrics?.capabilityValues[item.capability]
                  const s = metrics?.capabilities[item.capability]
                  const shown = cap ? capabilityValueLabel(game, cap, v) : null
                  value =
                    shown !== null
                      ? shown
                      : s?.observed
                        ? "Seen in a match"
                        : s?.claimed
                          ? "Pit says yes"
                          : null
                } else if ("field" in item) {
                  label = t(game, item.field)
                  value = summarizeField(
                    game,
                    item.field,
                    item.summary,
                    team.entries
                  )
                } else {
                  const col = game.teamListColumns.find(
                    (c) =>
                      "external" in c.source &&
                      c.source.external === item.external
                  )
                  label = col ? t(game, col.label) : item.external
                  const v = metrics?.external[item.external]
                  value =
                    v === undefined || v === null
                      ? null
                      : formatValue("external", v)
                }
                return (
                  <div key={i} className="contents">
                    <dt>{label}</dt>
                    <dd className="text-end tabular-nums">{value ?? "—"}</dd>
                  </div>
                )
              })}
            </dl>
          </section>
        ))}
      </div>
    </article>
  )
}

export function BriefingView({
  game,
  state,
  label,
  metrics,
  notes,
}: {
  game: GameDefinition
  state: DataState<Briefing>
  label: string
  metrics: ReadonlyMap<number, TeamMetrics> | null
  /** the plan notes thread, composed by the route */
  notes?: ReactNode
}) {
  return (
    <DataView state={state} size="page">
      <DataView.Loading label="Loading the briefing…">
        <SkeletonRows rows={6} rowClassName="h-28" />
      </DataView.Loading>
      <DataView.Missing
        not-found={{ title: `${label} isn’t in this event` }}
        not-synced={{ title: "This match hasn’t downloaded yet" }}
      />
      <DataView.Error title="Couldn’t load the briefing." />
      <DataView.Success>
        {(b: Briefing) => (
          <div className="flex flex-col gap-3">
            <p className="text-subhead text-muted-foreground">
              {b.ourAlliance
                ? `We’re ${b.ourAlliance === "red" ? "Red" : "Blue"}. Opponents first.`
                : "We’re not in this match."}
            </p>
            {b.teams.map((team) => (
              <TeamCard
                key={team.teamNumber}
                game={game}
                team={team}
                metrics={metrics?.get(team.teamNumber)}
              />
            ))}
            {notes}
          </div>
        )}
      </DataView.Success>
    </DataView>
  )
}
