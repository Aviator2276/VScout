// One team in the list (teams.md "Row anatomy"): rank, number, name, drivetrain and capability
// badges, 2–4 metric values, pit status and the watched star. The whole row is one link.
import { memo, use } from "react"
import { Star } from "@/components/icons/icon"
import { ListLinkContext } from "@/components/list/list"
import type { TeamMetrics } from "@/lib/metrics/event-team-metrics"
import { cn } from "@/lib/utils"
import type { Column } from "../utils/columns"
import type { TeamRow as TeamRowData } from "../utils/team-list"

export interface TeamRowProps {
  team: TeamRowData
  metrics: TeamMetrics | undefined
  columns: ReadonlyArray<Column>
  /** capability id → label, badge capabilities only */
  badges: ReadonlyArray<{ id: string; label: string }>
  drivetrainLabel: string | null
  watched: boolean
  showPit: boolean
  position: number
  setSize: number
}

const PIT_LABEL = {
  none: "Not pit scouted",
  partial: "Pit scouted, no photos",
  full: "Pit scouted",
} as const

function PitDot({ status }: { status: TeamMetrics["pit"] }) {
  return (
    <span
      role="img"
      aria-label={PIT_LABEL[status]}
      data-pit={status}
      className="relative size-2.5 overflow-hidden rounded-full border border-muted-foreground"
    >
      {status !== "none" ? (
        <span
          className={cn(
            "absolute inset-y-0 start-0 bg-muted-foreground",
            status === "full" ? "w-full" : "w-1/2"
          )}
        />
      ) : null}
    </span>
  )
}

export const TeamRow = memo(function TeamRowImpl({
  team,
  metrics,
  columns,
  badges,
  drivetrainLabel,
  watched,
  showPit,
  position,
  setSize,
}: TeamRowProps) {
  const renderLink = use(ListLinkContext)
  const caps = badges.filter((b) => {
    const c = metrics?.capabilities[b.id]
    return c?.claimed || c?.observed
  })
  const shown = caps.slice(0, 3)
  const more = caps.length - shown.length
  return (
    <div
      role="listitem"
      aria-setsize={setSize}
      aria-posinset={position}
      className="relative flex min-h-16 items-center gap-2 border-b border-border/60 bg-background py-2 pe-1 active:bg-muted"
    >
      <span
        className={cn(
          "w-8 shrink-0 text-end font-heading text-subhead tabular-nums",
          team.rank === null && "text-muted-foreground"
        )}
      >
        <span className="sr-only">
          {team.rank ? `Rank ${team.rank}` : "Unranked"}
        </span>
        <span aria-hidden>{team.rank ? `#${team.rank}` : "–"}</span>
      </span>
      <span
        aria-hidden
        className="w-12 shrink-0 rounded-md bg-muted py-0.5 text-center font-heading text-subhead tabular-nums"
        style={{ viewTransitionName: `team-${team.teamNumber}` }}
      >
        {team.teamNumber}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        {renderLink({
          href: `/teams/${team.teamNumber}`,
          className: "truncate text-body after:absolute after:inset-0",
          children: (
            <>
              <span className="sr-only">{team.teamNumber} </span>
              {team.nickname}
            </>
          ),
        })}
        <span className="flex min-w-0 items-center gap-1 truncate text-footnote text-muted-foreground">
          {drivetrainLabel ? <span>{drivetrainLabel}</span> : null}
          {shown.map((b) => (
            <span key={b.id} className="rounded bg-muted px-1 text-caption-1">
              {b.label}
            </span>
          ))}
          {more > 0 ? <span>+{more}</span> : null}
        </span>
      </div>
      <dl className="flex shrink-0 items-center gap-2">
        {columns.map((c) => {
          const v = c.read(metrics)
          return (
            <div key={c.id} className="w-10 text-end">
              <dt className="sr-only">{c.label}</dt>
              <dd
                className={cn(
                  "font-heading text-subhead tabular-nums",
                  v.missing && "text-muted-foreground"
                )}
              >
                <span aria-hidden>{v.text}</span>
                <span className="sr-only">{v.label}</span>
              </dd>
            </div>
          )
        })}
      </dl>
      <span className="flex w-6 shrink-0 flex-col items-center gap-1">
        {showPit ? <PitDot status={metrics?.pit ?? "none"} /> : null}
        {watched ? (
          <Star
            aria-label="Watched"
            size={14}
            className="fill-current text-warning"
          />
        ) : null}
      </span>
    </div>
  )
})
