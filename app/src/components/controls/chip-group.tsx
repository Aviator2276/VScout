// Multi-select chips: real toggle buttons with aria-pressed (Base UI ToggleGroup; Konsta's Chip is
// display-only). 56 pt in forms.
import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup } from "@base-ui/react/toggle-group"
import { Check } from "@/components/icons/icon"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

export interface ChipOption<TValue extends string> {
  value: TValue
  label: string
  /** e.g. at the field's maximum */
  disabled?: boolean
}

export interface ChipGroupProps<TValue extends string> {
  label: string
  options: ReadonlyArray<ChipOption<TValue>>
  value: ReadonlyArray<TValue>
  onValueChange: (value: Array<TValue>) => void
  size?: "default" | "form"
  /**
   * Quick filters (owner): one scrolling row of short chips; the fill and a bolder label show
   * what's on, no check mark. The visible chip is 36 pt, the hit area 44 pt.
   */
  compact?: boolean
  describedBy?: string | undefined
}

export function ChipGroup<TValue extends string>({
  label,
  options,
  value,
  onValueChange,
  size = "default",
  compact = false,
  describedBy,
}: ChipGroupProps<TValue>) {
  return (
    <ToggleGroup
      aria-label={label}
      aria-describedby={describedBy}
      multiple
      value={[...value]}
      onValueChange={(next: Array<unknown>) => {
        haptic("selection")
        onValueChange(next as Array<TValue>)
      }}
      className={cn(
        "flex gap-2",
        compact
          ? "-mx-4 [scrollbar-width:none] overflow-x-auto px-4 py-1"
          : "flex-wrap"
      )}
    >
      {options.map((o) => (
        <Toggle
          key={o.value}
          value={o.value}
          disabled={o.disabled === true && !value.includes(o.value)}
          className={cn(
            "group inline-flex shrink-0 items-center gap-1.5 rounded-full text-subhead whitespace-nowrap text-foreground transition-[background-color,color,scale] active:scale-95 disabled:opacity-40 data-[pressed]:bg-primary data-[pressed]:text-primary-foreground",
            compact
              ? "hit-44 min-h-9 bg-muted px-3.5 data-[pressed]:font-semibold"
              : cn(
                  "border border-border px-4 data-[pressed]:border-primary",
                  size === "form" ? "min-h-14" : "min-h-11"
                )
          )}
        >
          {/* forms: the state is never color alone (ui-patterns §2.3); compact chips change
              fill and weight instead */}
          {compact ? null : (
            <Check
              aria-hidden
              size={16}
              className="hidden group-data-[pressed]:block"
            />
          )}
          {o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
