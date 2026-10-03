// One team (teams.md T2): a header, then Overview · Matches · Notes · Pit · Post sub-views (URL
// `view`). Metrics always show their sample size; claimed and observed capabilities are labelled
// apart (round-1 criterion 5).
import { use, useState } from "react"
import type { ReactNode } from "react"
import { Segmented } from "@/components/controls/segmented"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import {
  Camera,
  ClipboardList,
  MessageSquare,
  Trash2,
} from "@/components/icons/icon"
import { List, ListLinkContext } from "@/components/list/list"
import { SwipeRow } from "@/components/list/swipe-row"
import { NoteList } from "@/components/notes/note-list"
import type { NoteItem } from "@/components/notes/note-list"
import { t } from "@/games/kit/labels"
import type { GameDefinition } from "@/games/types"
import type { DataState } from "@/lib/db/react/data-state"
import type {
  MatchRecord,
  MediaAssetRecord,
  PostScoutingRecord,
} from "@/lib/db/types"
import type { TeamMetrics } from "@/lib/metrics/event-team-metrics"
import { formatMetric, formatValue } from "@/lib/metrics/format-metric"
import { cn } from "@/lib/utils"
import { longMatchLabel, shortMatchLabel } from "@/utils/match-label"
import type { TeamDetail, TeamPit } from "../api/get-teams"
import { summarize } from "../utils/field-summary"
import { drivetrainName } from "./team-list-view"

import { TEAM_VIEWS } from "../types/team-views"
import type { TeamViewKey } from "../types/team-views"

const VIEW_LABEL: Record<TeamViewKey, string> = {
  overview: "Overview",
  matches: "Matches",
  notes: "Notes",
  pit: "Pit",
  post: "Post",
}

export function TeamDetailView({
  state,
  teamNumber,
  view,
  onViewChange,
  actions,
  hero,
  children,
}: {
  state: DataState<TeamDetail>
  teamNumber: number
  view: TeamViewKey
  onViewChange: (view: TeamViewKey) => void
  /** Scout Next / Pit Scout for scouters, composed by the route */
  actions?: ReactNode
  /** robot photos, the first thing on the page (owner) */
  hero?: ReactNode
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
            {hero}
            <header className="flex items-center gap-3">
              <span className="rounded-xl bg-muted px-3 py-1 font-heading text-title-2 tabular-nums">
                {team.teamNumber}
              </span>
              <div className="min-w-0">
                <p className="truncate text-headline">{team.nickname}</p>
                <p className="text-footnote text-muted-foreground">
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
            {actions}
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
          </div>
        )}
      </DataView.Success>
    </DataView>
  )
}

/** The robot, front and center (owner): the newest photo large, the others in a strip below. */
export function TeamPhotoHero({
  photos,
  teamNumber,
}: {
  photos: ReadonlyArray<MediaAssetRecord>
  teamNumber: number
}) {
  const [selected, setSelected] = useState(0)
  const main = photos[selected] ?? photos[0]
  if (!main)
    return (
      <div className="flex aspect-[16/7] flex-col items-center justify-center gap-1 rounded-2xl bg-muted text-muted-foreground">
        <Camera aria-hidden size={28} />
        <p className="text-subhead">No robot photo yet</p>
      </div>
    )
  return (
    <section
      aria-label={`Team ${teamNumber} robot photos`}
      className="flex flex-col gap-2"
    >
      <img
        src={main.url}
        alt={`Team ${teamNumber}’s robot`}
        className="aspect-[4/3] w-full rounded-2xl bg-muted object-cover"
      />
      {photos.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto" aria-label="More photos">
          {photos.map((p, i) => (
            <li key={p.id} className="shrink-0">
              <button
                type="button"
                aria-label={`Photo ${i + 1}`}
                aria-pressed={i === selected}
                onClick={() => setSelected(i)}
                className={cn(
                  "block overflow-hidden rounded-lg ring-2 transition-[box-shadow]",
                  i === selected ? "ring-primary" : "ring-transparent"
                )}
              >
                <img
                  src={p.thumbUrl ?? p.url}
                  alt=""
                  loading="lazy"
                  className="size-14 object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

const CONFIDENCE = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
}

export function TeamOverview({
  game,
  team,
  metrics,
}: {
  game: GameDefinition
  team: TeamDetail
  metrics: TeamMetrics | undefined
}) {
  const externals = game.teamListColumns.flatMap((c) =>
    "external" in c.source
      ? [{ id: c.source.external, label: t(game, c.label) }]
      : []
  )
  return (
    <>
      <List.Section
        title="Metrics"
        footer="From this event’s scouting. Sample sizes in matches."
      >
        {game.metrics.map((def) => {
          const cell = metrics?.metrics[def.id]
          const f = formatMetric(def.format, cell)
          const sub =
            cell && !("error" in cell) && cell.value !== null
              ? `${cell.sampleSize} ${cell.sampleSize === 1 ? "match" : "matches"} · ${CONFIDENCE[cell.confidence]}`
              : f.label
          return (
            <List.Row
              key={def.id}
              title={t(game, def.label)}
              subtitle={sub}
              detail={
                <span className="font-heading tabular-nums">{f.text}</span>
              }
            />
          )
        })}
      </List.Section>
      {externals.length > 0 ? (
        <List.Section title="External">
          {externals.map((e) => {
            const v = metrics?.external[e.id]
            return (
              <List.Row
                key={e.id}
                title={e.label}
                detail={
                  v === null || v === undefined
                    ? "—"
                    : formatValue("external", v)
                }
              />
            )
          })}
        </List.Section>
      ) : null}
      <List.Section title="Capabilities">
        {game.capabilities.map((c) => {
          const state = metrics?.capabilities[c.id]
          const value = metrics?.capabilityValues[c.id]
          const flags = [
            state?.claimed ? "Pit says yes" : null,
            state?.observed ? "Seen in a match" : null,
          ].filter(Boolean)
          const detail =
            c.display === "value"
              ? value === null || value === undefined
                ? "—"
                : typeof value === "string"
                  ? t(game, value)
                  : String(value)
              : state?.claimed || state?.observed
                ? "Yes"
                : "Unknown"
          return (
            <List.Row
              key={c.id}
              title={t(game, c.label)}
              subtitle={flags.length ? flags.join(" · ") : "No data yet"}
              detail={detail}
            />
          )
        })}
      </List.Section>
      <List.Section title="Event">
        <List.Row title="Ranking Points" detail={team.rankingPoints ?? "—"} />
        <List.Row title="Pit" detail={team.pitLocation ?? "—"} />
        <List.Row
          title="Drivetrain"
          detail={drivetrainName(metrics?.drivetrain) ?? "Unknown"}
        />
      </List.Section>
    </>
  )
}

export function TeamMatches({
  state,
  teamNumber,
  onScout,
}: {
  state: DataState<ReadonlyArray<MatchRecord>>
  teamNumber: number
  /** swipe left on an unplayed match: scout this team in it (owner's example) */
  onScout?: (matchKey: string) => void
}) {
  const renderLink = use(ListLinkContext)
  return (
    <DataView state={state}>
      <DataView.Empty title="No matches for this team yet" />
      <DataView.Error title="Couldn’t load this team’s matches." />
      <DataView.Success>
        {(matches: ReadonlyArray<MatchRecord>) => (
          <ul className="flex flex-col gap-2" aria-label="Matches">
            {matches.map((m) => {
              const alliance = m.alliances.red.teamNumbers.includes(teamNumber)
                ? "red"
                : "blue"
              const ours = m.alliances[alliance].score
              const theirs =
                m.alliances[alliance === "red" ? "blue" : "red"].score
              const played =
                typeof ours === "number" && typeof theirs === "number"
              const result = !played
                ? "Not played"
                : m.winningAlliance === alliance
                  ? `Won ${ours}–${theirs}`
                  : m.winningAlliance === null
                    ? `Tied ${ours}–${theirs}`
                    : `Lost ${ours}–${theirs}`
              return (
                <li key={m.key} className="overflow-hidden rounded-2xl">
                  <SwipeRow
                    trailing={
                      onScout && !played
                        ? [
                            {
                              label: "Scout",
                              icon: ClipboardList,
                              tone: "primary",
                              onAction: () => onScout(m.key),
                            },
                          ]
                        : []
                    }
                  >
                    <div
                      className={cn(
                        "relative flex min-h-14 items-center gap-3 border-s-4 px-4 py-2",
                        alliance === "red"
                          ? "border-alliance-red bg-alliance-red-muted"
                          : "border-alliance-blue bg-alliance-blue-muted"
                      )}
                    >
                      {renderLink({
                        href: `/matches/${m.key}`,
                        className:
                          "w-14 font-heading text-headline after:absolute after:inset-0",
                        children: (
                          <>
                            <span aria-hidden>{shortMatchLabel(m)}</span>
                            <span className="sr-only">{longMatchLabel(m)}</span>
                          </>
                        ),
                      })}
                      <span className="flex-1 text-subhead">
                        {alliance === "red" ? "Red" : "Blue"} alliance
                      </span>
                      <span className="text-subhead tabular-nums">
                        {result}
                      </span>
                    </div>
                  </SwipeRow>
                </li>
              )
            })}
          </ul>
        )}
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

export function TeamPitView({
  game,
  state,
}: {
  game: GameDefinition
  state: DataState<TeamPit>
}) {
  return (
    <DataView state={state}>
      <DataView.Missing
        not-scouted={{
          icon: ClipboardList,
          title: "Not pit scouted yet",
          description:
            "Pit answers and robot photos show here once someone scouts this team.",
        }}
      />
      <DataView.Error title="Couldn’t load pit scouting." />
      <DataView.Success>
        {({ entry, photos }: TeamPit) => {
          const lines = summarize(game, game.pitForm, entry.data)
          return (
            <>
              {photos.length > 0 ? (
                <ul
                  className="flex gap-2 overflow-x-auto py-2"
                  aria-label="Robot photos"
                >
                  {photos.map((p) => (
                    <li key={p.id} className="shrink-0">
                      <img
                        src={p.thumbUrl ?? p.url}
                        alt={`Robot photo ${photos.indexOf(p) + 1}`}
                        className="h-32 w-auto rounded-xl object-cover"
                        loading="lazy"
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 py-2 text-subhead text-muted-foreground">
                  <Camera aria-hidden size={16} /> No robot photos yet
                </p>
              )}
              <List.Section title="Robot">
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
                  <List.Row
                    title="Weight"
                    detail={`${entry.robot.weightLb} lb`}
                  />
                ) : null}
              </List.Section>
              {lines.length > 0 ? (
                <List.Section title="Pit Answers">
                  {lines.map((l) => (
                    <List.Row key={l.id} title={l.label} detail={l.value} />
                  ))}
                </List.Section>
              ) : null}
            </>
          )
        }}
      </DataView.Success>
    </DataView>
  )
}

export function TeamPostView({
  game,
  state,
}: {
  game: GameDefinition
  state: DataState<ReadonlyArray<PostScoutingRecord>>
}) {
  return (
    <DataView state={state}>
      <DataView.Empty
        icon={ClipboardList}
        title="No post-scouting yet"
        description="Post-scouting summarizes a team after its matches."
      />
      <DataView.Error title="Couldn’t load post-scouting." />
      <DataView.Success>
        {(entries: ReadonlyArray<PostScoutingRecord>) => (
          <>
            {entries.map((e, i) => (
              <List.Section
                key={e.id}
                title={i === 0 ? "Latest" : `Earlier ${i}`}
              >
                {summarize(game, game.postForm, e.data).map((l) => (
                  <List.Row key={l.id} title={l.label} detail={l.value} />
                ))}
              </List.Section>
            ))}
          </>
        )}
      </DataView.Success>
    </DataView>
  )
}
