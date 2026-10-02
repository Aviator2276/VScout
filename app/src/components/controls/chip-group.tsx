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
  describedBy?: string | undefined
}

export function ChipGroup<TValue extends string>({
  label,
  options,
  value,
  onValueChange,
  size = "default",
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
      className="flex flex-wrap gap-2"
    >
      {options.map((o) => (
        <Toggle
          key={o.value}
          value={o.value}
          disabled={o.disabled === true && !value.includes(o.value)}
          className={cn(
            "group inline-flex items-center gap-1.5 rounded-full border border-border px-4 text-subhead text-foreground disabled:opacity-40 data-[pressed]:border-primary data-[pressed]:bg-primary data-[pressed]:text-primary-foreground",
            size === "form" ? "min-h-14" : "min-h-11"
          )}
        >
          {/* selected state is never color alone (ui-patterns §2.3) */}
          <Check
            aria-hidden
            size={16}
            className="hidden group-data-[pressed]:block"
          />
          {o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
