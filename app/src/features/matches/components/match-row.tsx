// One match in the list (matches.md "Row anatomy"): label + time, the two alliances, and the score
// or countdown, with coverage dots for scouters. The whole row is one link to the match.
import { memo, use } from "react"
import { Check, Star, Video } from "@/components/icons/icon"
import { ListLinkContext } from "@/components/list/list"
import { cn } from "@/lib/utils"
import type { Coverage, MatchView } from "../utils/match-view"
import { STATIONS } from "../utils/match-view"

export interface MatchRowProps {
  match: MatchView
  position: number
  setSize: number
  upNext: boolean
  ourTeam: number | null
  watched: ReadonlySet<number>
  showCoverage: boolean
  hasVideo: boolean
  now: number
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
})

export function formatMatchTime(time: number | null): string {
  return time === null ? "TBD" : timeFormat.format(time)
}

/** "~6 min" within the hour, else the clock time. */
export function countdown(time: number | null, now: number): string {
  if (time === null) return "TBD"
  const min = Math.round((time - now) / 60_000)
  if (min <= 0) return "Now"
  if (min < 60) return `~${min} min`
  return timeFormat.format(time)
}

function Alliance({
  color,
  teams,
  ourTeam,
  watched,
}: {
  color: "red" | "blue"
  teams: ReadonlyArray<number>
  ourTeam: number | null
  watched: ReadonlySet<number>
}) {
  const name = color === "red" ? "Red" : "Blue"
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="sr-only">
        {name} alliance: {teams.join(", ")}
      </span>
      <span
        aria-hidden
        className={cn(
          "w-3 text-caption-1 font-semibold",
          color === "red" ? "text-alliance-red" : "text-alliance-blue"
        )}
      >
        {name[0]}
      </span>
      {teams.map((t) => (
        <span
          key={t}
          aria-hidden
          className={cn(
            "inline-flex items-center gap-0.5 rounded px-1 font-heading text-subhead tabular-nums",
            color === "red"
              ? "bg-alliance-red-muted"
              : "bg-alliance-blue-muted",
            t === ourTeam && "font-bold underline underline-offset-2"
          )}
        >
          {t}
          {watched.has(t) ? <Star size={10} className="fill-current" /> : null}
        </span>
      ))}
    </div>
  )
}

const STATION_NAME = ["Red 1", "Red 2", "Red 3", "Blue 1", "Blue 2", "Blue 3"]

function CoverageDots({ coverage }: { coverage: Coverage }) {
  return (
    <div className="flex gap-0.5">
      {STATIONS.map((s, i) => {
        const n = coverage[i] ?? 0
        const label = `${STATION_NAME[i] ?? s}: ${
          n === 0
            ? "not scouted"
            : n === 1
              ? "scouted once"
              : `scouted ${n} times`
        }`
        return (
          <span
            key={s}
            role="img"
            aria-label={label}
            data-count={Math.min(n, 2)}
            className={cn(
              "size-2 rounded-full border",
              i < 3 ? "border-alliance-red" : "border-alliance-blue",
              n >= 1 && (i < 3 ? "bg-alliance-red" : "bg-alliance-blue"),
              n >= 2 &&
                "ring-1 ring-current ring-offset-1 ring-offset-background"
            )}
          />
        )
      })}
    </div>
  )
}

function Result({ match }: { match: MatchView }) {
  const { redScore, blueScore, winner } = match
  return (
    <span className="flex items-center gap-1 font-heading text-subhead tabular-nums">
      <span className="sr-only">
        {winner
          ? `${winner === "red" ? "Red" : "Blue"} won ${Math.max(redScore ?? 0, blueScore ?? 0)} to ${Math.min(redScore ?? 0, blueScore ?? 0)}`
          : `Tied ${redScore ?? 0} to ${blueScore ?? 0}`}
      </span>
      <span aria-hidden className={cn(winner === "red" && "font-bold")}>
        {redScore ?? "–"}
      </span>
      <span aria-hidden>–</span>
      <span aria-hidden className={cn(winner === "blue" && "font-bold")}>
        {blueScore ?? "–"}
      </span>
      {winner ? (
        <Check
          aria-hidden
          size={14}
          className={
            winner === "red" ? "text-alliance-red" : "text-alliance-blue"
          }
        />
      ) : null}
    </span>
  )
}

export const MatchRow = memo(function MatchRowImpl({
  match,
  position,
  setSize,
  upNext,
  ourTeam,
  watched,
  showCoverage,
  hasVideo,
  now,
}: MatchRowProps) {
  const renderLink = use(ListLinkContext)
  const when = match.played
    ? formatMatchTime(match.time)
    : countdown(match.time, now)
  return (
    <div
      role="listitem"
      aria-setsize={setSize}
      aria-posinset={position}
      // wraps at the largest text sizes so nothing scrolls sideways (AX3, ui-design-system §6.2)
      className="relative flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 bg-card py-2 ps-3 pe-1 active:bg-muted"
    >
      {/* alliance stripe: red top half, blue bottom half */}
      <span
        aria-hidden
        className="absolute inset-y-1 start-0 w-1 overflow-hidden rounded-full"
      >
        <span className="block h-1/2 bg-alliance-red" />
        <span className="block h-1/2 bg-alliance-blue" />
      </span>
      <div className="flex min-w-14 shrink-0 flex-col">
        {renderLink({
          href: `/matches/${match.key}`,
          className:
            "font-heading text-headline after:absolute after:inset-0 focus-visible:outline-none",
          children: (
            <>
              <span aria-hidden>{match.label}</span>
              <span className="sr-only">
                {match.longLabel}
                {upNext ? ", up next" : ""}
              </span>
            </>
          ),
        })}
        <span className="text-footnote text-muted-foreground">
          {formatMatchTime(match.time)}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Alliance
          color="red"
          teams={match.red}
          ourTeam={ourTeam}
          watched={watched}
        />
        <Alliance
          color="blue"
          teams={match.blue}
          ourTeam={ourTeam}
          watched={watched}
        />
      </div>
      <div className="ms-auto flex shrink-0 flex-col items-end gap-1">
        {upNext ? (
          <span className="rounded-full bg-primary px-2 text-caption-1 font-semibold text-primary-foreground">
            Up next
          </span>
        ) : null}
        <span className="flex items-center gap-1">
          {hasVideo ? (
            <Video
              aria-label="Video downloaded"
              size={14}
              className="text-muted-foreground"
            />
          ) : null}
          {match.played ? (
            <Result match={match} />
          ) : (
            <span className="text-subhead text-muted-foreground tabular-nums">
              {when}
            </span>
          )}
        </span>
        {showCoverage ? <CoverageDots coverage={match.coverage} /> : null}
      </div>
    </div>
  )
})
