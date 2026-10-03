// iOS segmented control (Konsta draws it). Single choice, so it's a radiogroup; 44 pt tall, 56 pt in
// scouting forms (ui-design-system §6.4, §14).
import { Segmented as KSegmented, SegmentedButton } from "konsta/react"
import { useId } from "react"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

export interface SegmentedOption<TValue extends string> {
  value: TValue
  label: string
}

export interface SegmentedProps<TValue extends string> {
  /** the group's accessible name */
  label: string
  options: ReadonlyArray<SegmentedOption<TValue>>
  value: TValue | null
  onValueChange: (value: TValue) => void
  /** form = 56 pt targets for gloves */
  size?: "default" | "form"
  /** ids of help or error text */
  describedBy?: string | undefined
}

export function Segmented<TValue extends string>({
  label,
  options,
  value,
  onValueChange,
  size = "default",
  describedBy,
}: SegmentedProps<TValue>) {
  const name = useId()
  const height = size === "form" ? "min-h-14" : "min-h-11"
  const move = (from: number, step: number) => {
    const next = options[(from + step + options.length) % options.length]
    if (next) onValueChange(next.value)
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      id={name}
    >
      {/* explicit colors: the token bridge maps Konsta's text-black to our foreground, which is
          white in dark mode (1.57:1 on Konsta's light highlight) */}
      <KSegmented
        strong
        rounded
        className={height}
        // a raised glass thumb on the selected option (owner: more liquid glass, iOS 26)
        colors={{
          strongBgIos: "bg-muted",
          strongHighlightBgIos:
            "bg-white/85 shadow-[0_2px_8px_rgb(0_0_0/0.12)] ring-1 ring-black/5 dark:bg-[oklch(0.42_0.01_220)] dark:ring-white/10",
        }}
      >
        {options.map((o, i) => {
          const checked = o.value === value
          return (
            <SegmentedButton
              key={o.value}
              active={checked}
              component="button"
              className={cn(height, "text-foreground!")}
              role="radio"
              aria-checked={checked}
              // one tab stop: the selected (or first) option; arrows move like native radios
              tabIndex={checked || (value === null && i === 0) ? 0 : -1}
              onClick={() => {
                haptic("selection")
                onValueChange(o.value)
              }}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") move(i, 1)
                if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(i, -1)
              }}
            >
              {/* Konsta's own class merge drops a size class (it reads text-subhead as a color),
                  and its text-[15px] ignores Dynamic Type: size the label instead */}
              <span className="text-subhead">{o.label}</span>
            </SegmentedButton>
          )
        })}
      </KSegmented>
    </div>
  )
}
