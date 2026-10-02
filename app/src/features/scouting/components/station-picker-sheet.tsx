// "Scout a Robot" on a match (matches.md M2): the six stations in field order with each robot's
// entry count, a Needed badge where the recommender sees a gap, and Edit My Entry for my own.
import { Sheet } from "@/components/overlays/sheet"
import { cn } from "@/lib/utils"
import type { Station } from "../utils/recommend-slots"
import { STATION_ORDER } from "../utils/recommend-slots"
import { stationLabel } from "./match-scouting"

export interface PickerRobot {
  station: Station
  teamNumber: number
  entries: number
  needed: boolean
  mine: boolean
}

export function StationPickerSheet({
  open,
  onOpenChange,
  title,
  robots,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  robots: ReadonlyArray<PickerRobot>
  onPick: (teamNumber: number) => void
}) {
  const ordered = [...robots].sort(
    (a, b) =>
      STATION_ORDER.indexOf(a.station) - STATION_ORDER.indexOf(b.station)
  )
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <Sheet.Content title="Scout a Robot" description={title}>
        <ul className="flex flex-col gap-2" aria-label="Robots">
          {ordered.map((r) => {
            const red = r.station.startsWith("red")
            return (
              <li key={r.station}>
                <button
                  type="button"
                  onClick={() => onPick(r.teamNumber)}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 rounded-2xl border-s-4 px-4 text-left",
                    red
                      ? "border-alliance-red bg-alliance-red-muted"
                      : "border-alliance-blue bg-alliance-blue-muted"
                  )}
                >
                  <span className="w-14 text-subhead font-semibold">
                    {stationLabel(r.station)}
                  </span>
                  <span className="font-heading text-title-3 tabular-nums">
                    {r.teamNumber}
                  </span>
                  <span className="ms-auto flex flex-col items-end text-footnote">
                    {r.mine ? (
                      <span className="font-semibold text-primary">
                        Edit My Entry
                      </span>
                    ) : r.needed ? (
                      <span className="rounded-full bg-primary px-2 font-semibold text-primary-foreground">
                        Needed
                      </span>
                    ) : null}
                    <span className="text-muted-foreground">
                      {r.entries === 0
                        ? "No entries"
                        : `${r.entries} ${r.entries === 1 ? "entry" : "entries"}`}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Sheet.Content>
    </Sheet>
  )
}
