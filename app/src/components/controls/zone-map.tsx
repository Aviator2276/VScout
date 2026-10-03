// Pick a zone on the field (game-module.md fieldPosition, zone mode). The named zones are a
// radiogroup of large chips (56 pt for gloves); the drawing shows where they are and is a tap
// shortcut. Zones are normalized polygons drawn from the blue side; `mirror` flips them for red.
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { ChoiceChips } from "./choice-chips"

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
  describedBy,
}: {
  label: string
  image: { src: string; width: number; height: number; alt: string }
  zones: ReadonlyArray<Zone<TId>>
  value: TId | null
  onValueChange: (id: TId) => void
  mirror?: boolean
  describedBy?: string | undefined
}) {
  const { width: w, height: h } = image
  const pick = (id: TId) => {
    haptic("selection")
    onValueChange(id)
  }
  return (
    <div className="flex flex-col gap-3">
      {/* a pointer shortcut; the chips below are the accessible control */}
      <svg
        aria-hidden
        viewBox={`0 0 ${w} ${h}`}
        className="w-full rounded-xl bg-muted"
      >
        <image href={image.src} width={w} height={h} />
        <g transform={mirror ? `translate(${w} 0) scale(-1 1)` : undefined}>
          {zones.map((z) => (
            <polygon
              key={z.id}
              data-zone={z.id}
              points={z.polygon.map(([x, y]) => `${x * w},${y * h}`).join(" ")}
              onClick={() => pick(z.id)}
              className={cn(
                "cursor-pointer stroke-foreground/40 stroke-[4]",
                z.id === value
                  ? "fill-primary/45"
                  : "fill-transparent hover:fill-primary/15"
              )}
            />
          ))}
        </g>
      </svg>
      <ChoiceChips
        label={label}
        options={zones.map((z) => ({ value: z.id, label: z.label }))}
        value={value}
        onValueChange={onValueChange}
        size="form"
        describedBy={describedBy}
      />
    </div>
  )
}
