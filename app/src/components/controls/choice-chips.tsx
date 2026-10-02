// Single-choice chips for more than 5 options or long labels (ui-patterns §2.2). A radiogroup like
// Segmented, but wrapping over lines.
import { Check } from "@/components/icons/icon"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

export interface ChoiceChipOption<TValue extends string> {
  value: TValue
  label: string
}

export function ChoiceChips<TValue extends string>({
  label,
  options,
  value,
  onValueChange,
  size = "default",
  describedBy,
}: {
  label: string
  options: ReadonlyArray<ChoiceChipOption<TValue>>
  value: TValue | null
  onValueChange: (value: TValue) => void
  size?: "default" | "form"
  describedBy?: string | undefined
}) {
  const pick = (v: TValue) => {
    haptic("selection")
    onValueChange(v)
  }
  const move = (from: number, step: number) => {
    const next = options[(from + step + options.length) % options.length]
    if (next) pick(next.value)
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      className="flex flex-wrap gap-2"
    >
      {options.map((o, i) => {
        const checked = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (value === null && i === 0) ? 0 : -1}
            onClick={() => pick(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault()
                move(i, 1)
              }
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault()
                move(i, -1)
              }
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-4 text-subhead",
              size === "form" ? "min-h-14" : "min-h-11",
              checked
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground"
            )}
          >
            {checked ? <Check aria-hidden size={16} /> : null}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
