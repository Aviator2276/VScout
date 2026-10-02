// Tap a zone on a field drawing (game-module.md fieldPosition, zone mode). Zones are normalized
// polygons drawn from the blue side; `mirror` flips them for the red alliance. Each zone is a radio
// with its own name, so it works without seeing the drawing.
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

export interface Zone<TId extends string> {
  id: TId
  label: string
  /** 0..1 coordinates */
  polygon: ReadonlyArray<readonly [number, number]>
}

export function ZoneMap<TId extends string>({
  label,
  image,
  zones,
  value,
  onValueChange,
  mirror = false,
  emptyHint = "Tap a zone.",
  describedBy,
}: {
  label: string
  image: { src: string; width: number; height: number; alt: string }
  zones: ReadonlyArray<Zone<TId>>
  value: TId | null
  onValueChange: (id: TId) => void
  mirror?: boolean
  /** shown until a zone is picked */
  emptyHint?: string
  describedBy?: string | undefined
}) {
  const { width: w, height: h } = image
  const pick = (id: TId) => {
    haptic("selection")
    onValueChange(id)
  }
  const move = (from: number, step: number) => {
    const z = zones[(from + step + zones.length) % zones.length]
    if (z) pick(z.id)
  }
  const selected = zones.find((z) => z.id === value)
  return (
    <div className="flex flex-col gap-2">
      <svg
        role="radiogroup"
        aria-label={label}
        aria-describedby={describedBy}
        viewBox={`0 0 ${w} ${h}`}
        className="w-full rounded-xl bg-muted"
      >
        <image href={image.src} width={w} height={h} aria-hidden />
        <g transform={mirror ? `translate(${w} 0) scale(-1 1)` : undefined}>
          {zones.map((z, i) => {
            const checked = z.id === value
            return (
              <polygon
                key={z.id}
                role="radio"
                aria-checked={checked}
                aria-label={z.label}
                tabIndex={checked || (value === null && i === 0) ? 0 : -1}
                points={z.polygon
                  .map(([x, y]) => `${x * w},${y * h}`)
                  .join(" ")}
                onClick={() => pick(z.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowDown")
                    move(i, 1)
                  if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(i, -1)
                  if (e.key === " " || e.key === "Enter") pick(z.id)
                }}
                className={cn(
                  "cursor-pointer stroke-foreground/40 stroke-[4] outline-none focus-visible:stroke-ring focus-visible:stroke-[10]",
                  checked
                    ? "fill-primary/45"
                    : "fill-transparent hover:fill-primary/15"
                )}
              />
            )
          })}
        </g>
      </svg>
      <p aria-hidden className="text-footnote text-muted-foreground">
        {selected ? selected.label : emptyHint}
      </p>
    </div>
  )
}
