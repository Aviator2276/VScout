// Home widgets owned by matches (features/home.md H5): Our Next Match and Watched Teams.
import { use } from "react"
import { DataView } from "@/components/data-view/data-view"
import { WidgetCard } from "@/components/grid/widget-card"
import { CalendarDays, Star } from "@/components/icons/icon"
import { ListLinkContext } from "@/components/list/list"
import { useNow } from "@/hooks/use-now"
import { useOurTeam } from "@/hooks/use-our-team"
import { useWatchedTeams } from "@/hooks/use-prefs"
import type { DataState } from "@/lib/db/react/data-state"
import type { MatchRecord } from "@/lib/db/types"
import { cn } from "@/lib/utils"
import type { WidgetProps } from "@/types/widget"
import { longMatchLabel, shortMatchLabel } from "@/utils/match-label"
import { useEventMatches } from "../api/get-matches"
import { countdown } from "./match-row"

function upcoming(
  matches: ReadonlyArray<MatchRecord>,
  team: number
): Array<MatchRecord> {
  return matches
    .filter((m) => m.status !== "played" && m.teamNumbers.includes(team))
    .sort(
      (a, b) => (a.scheduledTime ?? Infinity) - (b.scheduledTime ?? Infinity)
    )
}

export function OurNextMatchWidget({ eventKey, w, h }: WidgetProps) {
  const ourTeam = useOurTeam()
  const matches = useEventMatches(eventKey)
  const now = useNow()
  const renderLink = use(ListLinkContext)
  const state: DataState<MatchRecord> =
    ourTeam === null
      ? { status: "idle" }
      : matches.status !== "success"
        ? matches
        : (() => {
            const next = upcoming(matches.data, ourTeam)[0]
            return next
              ? { status: "success", data: next }
              : { status: "empty" }
          })()
  return (
    <WidgetCard title="Our Next Match" href="/matches?ours=true">
      <DataView state={state} size="inline">
        <DataView.Idle
          icon={CalendarDays}
          title="Your admin hasn’t set the team number yet"
        />
        <DataView.Empty
          icon={CalendarDays}
          title={`No more matches for ${ourTeam ?? "us"}`}
        />
        <DataView.Missing
          not-synced={{ title: "Schedule not downloaded yet" }}
        />
        <DataView.Error title="Couldn’t load matches." />
        <DataView.Success>
          {(m: MatchRecord) => {
            const red = m.alliances.red.teamNumbers.includes(ourTeam ?? -1)
            const ours = red
              ? m.alliances.red.teamNumbers
              : m.alliances.blue.teamNumbers
            const theirs = red
              ? m.alliances.blue.teamNumbers
              : m.alliances.red.teamNumbers
            return (
              <div className="relative flex h-full flex-col gap-1">
                {renderLink({
                  href:
                    h >= 4 ? `/scout/strategy/${m.key}` : `/matches/${m.key}`,
                  className:
                    "font-heading text-title-2 after:absolute after:inset-0",
                  children: w >= 4 ? longMatchLabel(m) : shortMatchLabel(m),
                })}
                <p className="flex items-center gap-2 text-subhead">
                  <span
                    className={cn(
                      "rounded px-1.5 text-caption-1 font-semibold",
                      red
                        ? "bg-alliance-red text-alliance-red-foreground"
                        : "bg-alliance-blue text-alliance-blue-foreground"
                    )}
                  >
                    {red ? "Red" : "Blue"}
                  </span>
                  {countdown(m.predictedTime ?? m.scheduledTime, now)}
                </p>
                {w >= 4 ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-footnote">
                    <dt className="text-muted-foreground">With</dt>
                    <dd className="tabular-nums">
                      {ours.filter((t) => t !== ourTeam).join(", ")}
                    </dd>
                    <dt className="text-muted-foreground">Against</dt>
                    <dd className="tabular-nums">{theirs.join(", ")}</dd>
                  </dl>
                ) : null}
                {h >= 4 ? (
                  <p className="mt-auto text-footnote text-primary">
                    Open the briefing
                  </p>
                ) : null}
              </div>
            )
          }}
        </DataView.Success>
      </DataView>
    </WidgetCard>
  )
}

export function WatchedTeamsWidget({ eventKey, h }: WidgetProps) {
  const { watched } = useWatchedTeams()
  const matches = useEventMatches(eventKey)
  const now = useNow()
  const rows =
    matches.status === "success"
      ? [...watched].flatMap((t) => {
          const next = upcoming(matches.data, t)[0]
          return next ? [{ team: t, match: next }] : []
        })
      : []
  const state: DataState<typeof rows> =
    watched.size === 0
      ? { status: "idle" }
      : matches.status !== "success"
        ? matches
        : rows.length
          ? { status: "success", data: rows }
          : { status: "empty" }
  return (
    <WidgetCard title="Watched Teams" href="/teams?watched=true">
      <DataView state={state} size="inline">
        <DataView.Idle
          icon={Star}
          title="Pick teams to watch"
          description="Tap the star on a team."
        />
        <DataView.Empty
          icon={Star}
          title="None of your teams have upcoming matches"
        />
        <DataView.Missing
          not-synced={{ title: "Schedule not downloaded yet" }}
        />
        <DataView.Error title="Couldn’t load matches." />
        <DataView.Success>
          {(list: typeof rows) => (
            <ul className="flex flex-col gap-1 text-subhead">
              {list.slice(0, Math.max(1, Math.floor(h * 1.5))).map((r) => (
                <li key={r.team} className="flex justify-between gap-2">
                  <span className="font-heading tabular-nums">{r.team}</span>
                  <span className="text-muted-foreground">
                    {shortMatchLabel(r.match)} ·{" "}
                    {countdown(r.match.scheduledTime, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DataView.Success>
      </DataView>
    </WidgetCard>
  )
}
