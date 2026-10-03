// Connection over the last 30 minutes (features/sync-status.md S3): a step line of the notch's bars,
// offline stretches as muted bands, a crosshair and tooltip on hover or touch, and the same samples as
// a table for screen readers. Hand-built SVG (ADR-079), one series, so the title names it (no legend).
import { useId, useRef, useState } from "react"
import type { HistorySample } from "@/lib/network/network-telemetry"
import { chartModel, sampleAt } from "../utils/connection-chart"

const time = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
})
const BAR_WORD = ["Offline", "1 bar", "2 bars", "3 bars", "4 bars"]

function describe(s: HistorySample): string {
  return [
    time.format(s.at),
    s.online ? (BAR_WORD[s.quality] ?? "") : "Offline",
    s.online && s.pingMs !== null ? `${s.pingMs} ms` : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

export function ConnectionChart({
  samples,
  windowMs,
  sampleMs,
  now,
}: {
  samples: ReadonlyArray<HistorySample>
  windowMs: number
  sampleMs: number
  now: number
}) {
  const model = chartModel(samples, windowMs, sampleMs, now)
  const [hover, setHover] = useState<{ f: number; s: HistorySample } | null>(
    null
  )
  const box = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const point = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const s = sampleAt(samples, model.start, windowMs, f)
    setHover(s ? { f, s } : null)
  }
  const x = (t: number) => (t - model.start) / windowMs
  return (
    <figure aria-labelledby={titleId} className="flex flex-col gap-1.5">
      <figcaption className="flex items-baseline justify-between px-1">
        <span
          id={titleId}
          className="text-footnote text-muted-foreground uppercase"
        >
          Connection
        </span>
        <span className="text-caption-1 text-muted-foreground tabular-nums">
          {model.summary}
        </span>
      </figcaption>
      <div className="rounded-2xl bg-card p-3 shadow-xs">
        <div
          ref={box}
          aria-hidden
          className="relative h-24 touch-pan-y"
          onPointerMove={(e) => point(e.clientX)}
          onPointerDown={(e) => point(e.clientX)}
          onPointerLeave={() => setHover(null)}
        >
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
          >
            {/* recessive hairline grid at each bar level */}
            {[0.25, 0.5, 0.75, 1].map((g) => (
              <line
                key={g}
                x1={0}
                x2={1}
                y1={1 - g}
                y2={1 - g}
                stroke="var(--color-border)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {model.bands.map((b) => (
              <rect
                key={b.from}
                x={x(b.from)}
                width={Math.max(0.004, x(b.to) - x(b.from))}
                y={0}
                height={1}
                fill="var(--color-muted)"
              />
            ))}
            {model.area ? (
              <path d={model.area} fill="var(--color-chart-1)" opacity={0.1} />
            ) : null}
            {model.line ? (
              <path
                d={model.line}
                fill="none"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {hover ? (
              <line
                x1={hover.f}
                x2={hover.f}
                y1={0}
                y2={1}
                stroke="var(--color-foreground)"
                strokeOpacity={0.4}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
          {model.bands.map((b) =>
            x(b.to) - x(b.from) > 0.08 ? (
              <span
                key={`l${b.from}`}
                className="absolute top-1 text-caption-2 text-muted-foreground"
                style={{ left: `calc(${x(b.from) * 100}% + 4px)` }}
              >
                Offline
              </span>
            ) : null
          )}
          {hover ? (
            <span
              className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-popover px-2 py-1 text-caption-1 whitespace-nowrap text-popover-foreground tabular-nums shadow-md"
              style={{
                left: `clamp(56px, ${hover.f * 100}%, calc(100% - 56px))`,
              }}
            >
              {describe(hover.s)}
            </span>
          ) : null}
        </div>
        <div
          aria-hidden
          className="mt-1 flex justify-between text-caption-2 text-muted-foreground"
        >
          <span>30 min ago</span>
          <span>Now</span>
        </div>
      </div>
      <table className="sr-only">
        <caption>Connection, last 30 minutes</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Signal</th>
          </tr>
        </thead>
        <tbody>
          {samples.slice(-30).map((s) => (
            <tr key={s.at}>
              <td>{time.format(s.at)}</td>
              <td>
                {s.online
                  ? `${BAR_WORD[s.quality] ?? ""}${s.pingMs !== null ? `, ${s.pingMs} ms` : ""}`
                  : "Offline"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
