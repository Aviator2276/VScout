// Multi-select chips: real toggle buttons with aria-pressed (Base UI ToggleGroup; Konsta's Chip is
// display-only). 56 pt in forms.
import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup } from "@base-ui/react/toggle-group"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

export interface ChipOption<TValue extends string> {
  value: TValue
  label: string
}

export interface ChipGroupProps<TValue extends string> {
  label: string
  options: ReadonlyArray<ChipOption<TValue>>
  value: ReadonlyArray<TValue>
  onValueChange: (value: Array<TValue>) => void
  size?: "default" | "form"
}

export function ChipGroup<TValue extends string>({
  label,
  options,
  value,
  onValueChange,
  size = "default",
}: ChipGroupProps<TValue>) {
  return (
    <ToggleGroup
      aria-label={label}
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
          className={cn(
            "rounded-full border border-border px-4 text-subhead text-foreground data-[pressed]:border-primary data-[pressed]:bg-primary data-[pressed]:text-primary-foreground",
            size === "form" ? "min-h-14" : "min-h-11"
          )}
        >
          {o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
