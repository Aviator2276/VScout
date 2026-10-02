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
}

export function Segmented<TValue extends string>({
  label,
  options,
  value,
  onValueChange,
  size = "default",
}: SegmentedProps<TValue>) {
  const name = useId()
  const height = size === "form" ? "min-h-14" : "min-h-11"
  const move = (from: number, step: number) => {
    const next = options[(from + step + options.length) % options.length]
    if (next) onValueChange(next.value)
  }
  return (
    <div role="radiogroup" aria-label={label} id={name}>
      <KSegmented strong rounded className={height}>
        {options.map((o, i) => {
          const checked = o.value === value
          return (
            <SegmentedButton
              key={o.value}
              active={checked}
              component="button"
              className={cn(height, "text-subhead")}
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
              {o.label}
            </SegmentedButton>
          )
        })}
      </KSegmented>
    </div>
  )
}
