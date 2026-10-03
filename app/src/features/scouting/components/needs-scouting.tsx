// The recommender's faces (scout-tab.md S1.9): the Scout tab card with one primary slot and a big Start
// button, and the full list grouped by match. The alliance is a red or blue token plus the word.
import { use } from "react"
import { Button } from "@/components/controls/button"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { CircleCheck, Lock } from "@/components/icons/icon"
import { ListLinkContext } from "@/components/list/list"
import type { DataState } from "@/lib/db/react/data-state"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { longMatchLabel, parseMatchKey } from "@/utils/match-label"
import { groupByMatch } from "../utils/recommend-slots"
import type { Recommendation, Reason, Slot } from "../utils/recommend-slots"
import { stationLabel } from "./match-scouting"

const SEGMENT_PHRASE: Record<string, string> = {
  early: "early matches",
  middle: "middle matches",
  late: "late matches",
}

function matchName(key: string): string {
  const id = parseMatchKey(key)
  return id ? longMatchLabel(id) : key
}

export function reasonText(reason: Reason, team: number): string {
  switch (reason.kind) {
    case "last-chance":
      return `Last chance to see ${team} in its ${SEGMENT_PHRASE[reason.segment] ?? reason.segment}`
    case "gap":
      return `No one has scouted ${team}’s ${SEGMENT_PHRASE[reason.segment] ?? reason.segment} yet`
    case "deficit":
      return `${team} has only ${reason.covered} scouted ${reason.covered === 1 ? "match" : "matches"}`
    case "our-match":
      return `${team} plays ${reason.with === "partner" ? "with" : "against"} us in ${matchName(reason.matchKey)}`
    case "second-opinion":
      return `Second opinion: ${team} has ${reason.scouters} ${reason.scouters === 1 ? "entry" : "entries"}`
  }
}

function StationToken({ slot }: { slot: Slot }) {
  const red = slot.station.startsWith("red")
  return (
    <span
      className={cn(
        "rounded-md px-1.5 text-subhead font-semibold",
        red
          ? "bg-alliance-red text-alliance-red-foreground"
          : "bg-alliance-blue text-alliance-blue-foreground"
      )}
    >
      {stationLabel(slot.station)}
    </span>
  )
}

export function scoutHref(slot: Pick<Slot, "matchKey" | "teamNumber">): string {
  return `/scouting/match/${slot.matchKey}/${slot.teamNumber}`
}

export function NeedsScoutingCard({
  state,
  closedForScouters,
  onStart,
  moreHref,
}: {
  state: DataState<Recommendation>
  /** an admin still gets recommendations, labelled (criterion 9) */
  closedForScouters: boolean
  onStart: (slot: Slot) => void
  moreHref: string
}) {
  const renderLink = use(ListLinkContext)
  return (
    <DataView state={state}>
      <DataView.Idle icon={Lock} title="Scouting is closed for now" />
      <DataView.Loading label="Finding a match to scout…">
        <SkeletonRows rows={1} rowClassName="h-40" />
      </DataView.Loading>
      <DataView.Empty
        icon={CircleCheck}
        title="Every upcoming robot is covered. Nice work."
      />
      <DataView.Missing
        not-synced={{ title: "Match schedule not downloaded yet" }}
      />
      <DataView.Error title="Couldn’t work out what needs scouting." />
      <DataView.Success>
        {(rec: Recommendation) => {
          const s = rec.primary
          if (!s) return null
          return (
            <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-xs">
              {closedForScouters ? (
                <p className="text-footnote font-semibold text-warning">
                  Scouting is closed for scouters
                </p>
              ) : null}
              <p className="flex flex-wrap items-center gap-1.5 text-headline">
                Scout {s.teamNumber} in {matchName(s.matchKey)} ·{" "}
                <StationToken slot={s} />
              </p>
              <p className="text-subhead text-muted-foreground">
                {reasonText(s.reason, s.teamNumber)}
                {s.started ? " · Already started" : ""}
              </p>
              <Button
                size="large"
                onClick={() => {
                  haptic("selection")
                  onStart(s)
                }}
              >
                Start Scouting {s.teamNumber}
              </Button>
              {renderLink({
                href: moreHref,
                className: "min-h-11 py-2 text-center text-body text-primary",
                children: "Other Options",
              })}
            </div>
          )
        }}
      </DataView.Success>
    </DataView>
  )
}

export function NeedsScoutingList({
  state,
  onStart,
  onPreviewMatch,
}: {
  state: DataState<Recommendation>
  onStart: (slot: Slot) => void
  /** tap a match heading: a preview sheet (owner), composed by the route */
  onPreviewMatch?: (matchKey: string) => void
}) {
  return (
    <DataView state={state} size="page">
      <DataView.Idle icon={Lock} title="Scouting is closed for now" />
      <DataView.Loading label="Finding matches to scout…">
        <SkeletonRows rows={6} rowClassName="h-16" />
      </DataView.Loading>
      <DataView.Empty
        icon={CircleCheck}
        title="Every upcoming robot is covered"
      />
      <DataView.Missing
        not-synced={{
          title: "Match schedule not downloaded yet",
          description: "Connect to download it.",
        }}
      />
      <DataView.Error title="Couldn’t work out what needs scouting." />
      <DataView.Success>
        {(rec: Recommendation) => {
          return (
            <div className="flex flex-col gap-5">
              {groupByMatch(rec.all).map(([key, slots]) => (
                <section key={key} aria-labelledby={`g-${key}`}>
                  <h2
                    id={`g-${key}`}
                    className="mb-1.5 px-1 text-footnote text-muted-foreground uppercase"
                  >
                    {onPreviewMatch ? (
                      <button
                        type="button"
                        onClick={() => onPreviewMatch(key)}
                        className="min-h-8 uppercase active:opacity-60"
                      >
                        {matchName(key)} ›
                      </button>
                    ) : (
                      matchName(key)
                    )}
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {slots.map((s) => (
                      <li key={`${s.matchKey}|${s.teamNumber}`}>
                        <button
                          type="button"
                          onClick={() => onStart(s)}
                          className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-card px-4 py-2 text-left shadow-xs active:bg-muted"
                        >
                          <span className="font-heading text-title-3 tabular-nums">
                            {s.teamNumber}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-subhead text-muted-foreground">
                              {reasonText(s.reason, s.teamNumber)}
                            </span>
                            <span className="text-footnote text-muted-foreground">
                              {s.scouters === 0
                                ? "No entries yet"
                                : `${s.scouters} ${s.scouters === 1 ? "entry" : "entries"}`}
                            </span>
                          </span>
                          <StationToken slot={s} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )
        }}
      </DataView.Success>
    </DataView>
  )
}
