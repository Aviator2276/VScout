// The app background picker (Settings → Appearance, owner): swatches grouped as Gradients, Shapes
// and Custom (the team's own images, src/assets/backgrounds/custom). One radio group.
import { APP_BACKGROUNDS } from "@/config/app-backgrounds"
import type {
  AppBackgroundDef,
  BackgroundGroup,
} from "@/config/app-backgrounds"
import { cn } from "@/lib/utils"

const GROUPS: ReadonlyArray<BackgroundGroup> = ["Gradients", "Shapes", "Custom"]

export function BackgroundPicker({
  value,
  onValueChange,
  labelledBy,
}: {
  value: string
  onValueChange: (id: string) => void
  /** id of the visible heading that names the group */
  labelledBy: string
}) {
  const known = APP_BACKGROUNDS.some((b) => b.id === value)
  const current = known ? value : "none"
  const none = APP_BACKGROUNDS.filter((b) => b.group === null)
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="flex flex-col gap-4 rounded-2xl bg-card p-3"
    >
      <Swatches items={none} current={current} onPick={onValueChange} />
      {GROUPS.map((g) => {
        const items = APP_BACKGROUNDS.filter((b) => b.group === g)
        if (items.length === 0) return null
        return (
          <section key={g} aria-label={g} className="flex flex-col gap-2">
            <h3 className="text-footnote text-muted-foreground uppercase">
              {g}
            </h3>
            <Swatches items={items} current={current} onPick={onValueChange} />
          </section>
        )
      })}
    </div>
  )
}

function Swatches({
  items,
  current,
  onPick,
}: {
  items: ReadonlyArray<AppBackgroundDef>
  current: string
  onPick: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5">
      {items.map((b) => {
        const on = current === b.id
        return (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(b.id)}
            className="flex flex-col items-center gap-1.5 text-footnote transition-[scale] active:scale-95"
          >
            <span
              aria-hidden
              className={cn(
                "aspect-[3/4] w-full rounded-xl bg-background ring-2 ring-offset-2 ring-offset-card",
                b.dims && "dark:brightness-[0.32] dark:saturate-[1.15]",
                on ? "ring-primary" : "ring-border/60"
              )}
              style={b.style ?? undefined}
            />
            <span className={cn("text-center", on && "font-semibold")}>
              {b.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
