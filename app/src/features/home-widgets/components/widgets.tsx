// Widgets owned by home itself (features/home.md H5): the Clock and the Pit Map.
import { useState } from "react"
import { DataView } from "@/components/data-view/data-view"
import { WidgetCard } from "@/components/grid/widget-card"
import { StaleNote } from "@/components/sync/sync-badge"
import { useNow } from "@/hooks/use-now"
import { useOnline } from "@/hooks/use-online"
import { useOurTeam } from "@/hooks/use-our-team"
import type { WidgetProps } from "@/types/widget"
import { usePitMap } from "../api/get-pit-map"

const clock = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
})
const day = new Intl.DateTimeFormat(undefined, { weekday: "long" })

export function ClockWidget({ w, h }: WidgetProps) {
  const now = useNow(15_000)
  const tiny = w === 1
  return (
    <WidgetCard title="Clock" compact={h === 1}>
      <p className="flex h-full flex-col justify-center" aria-live="off">
        <time
          dateTime={new Date(now).toISOString()}
          className={
            tiny
              ? "font-heading text-headline tabular-nums"
              : "font-heading text-title-1 tabular-nums"
          }
        >
          {clock.format(now)}
        </time>
        {tiny ? null : (
          <span className="text-footnote text-muted-foreground">
            {day.format(now)}
          </span>
        )}
        {h >= 2 ? (
          <span className="text-footnote text-muted-foreground">
            Delay unknown
          </span>
        ) : null}
      </p>
    </WidgetCard>
  )
}

export function PitMapWidget({ eventKey }: WidgetProps) {
  const now = useNow(60_000)
  const state = usePitMap(eventKey, now)
  const ourTeam = useOurTeam()
  const online = useOnline()
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  if (state.status !== "success")
    return (
      <WidgetCard title="Pit Map">
        <DataView
          state={
            state.status === "missing"
              ? { status: "missing", reason: "not-found" }
              : state.status === "error"
                ? {
                    status: "error",
                    error: {
                      code: "unknown",
                      message: "Couldn’t load the pit map.",
                    },
                    retry: state.retry,
                  }
                : { status: "loading" }
          }
          size="inline"
        >
          <DataView.Loading label="Loading pit map…" />
          <DataView.Missing
            not-found={{ title: "Pit map isn’t published for this event yet" }}
          />
          <DataView.Error title="Couldn’t load the pit map." />
        </DataView>
      </WidgetCard>
    )
  const { map } = state
  const w = map.width ?? natural?.w
  const h = map.height ?? natural?.h
  const ours = ourTeam
    ? map.pits.find((p) => p.teamNumber === ourTeam)
    : undefined
  return (
    <WidgetCard title="Pit Map">
      <figure className="flex h-full min-h-0 flex-col gap-1">
        <div className="relative min-h-0 flex-1">
          <div
            className="relative mx-auto max-h-full"
            style={w && h ? { aspectRatio: `${w} / ${h}` } : undefined}
          >
            <img
              src={map.imageUrl}
              alt={ours ? `Pit map. Our pit is highlighted.` : "Pit map"}
              className="size-full rounded-lg object-contain"
              onLoad={(e) =>
                setNatural({
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight,
                })
              }
            />
            {w && h
              ? map.pits.map((p) => (
                  <span
                    key={p.teamNumber}
                    aria-hidden
                    className={
                      p.teamNumber === ourTeam
                        ? "absolute rounded-sm bg-primary/40 ring-2 ring-primary"
                        : "absolute"
                    }
                    style={{
                      left: `${(p.x / w) * 100}%`,
                      top: `${(p.y / h) * 100}%`,
                      width: `${(p.w / w) * 100}%`,
                      height: `${(p.h / h) * 100}%`,
                    }}
                  />
                ))
              : null}
          </div>
        </div>
        {state.stale ? (
          <StaleNote updatedAt={state.fetchedAt} offline={!online} now={now} />
        ) : null}
      </figure>
    </WidgetCard>
  )
}
