// A dropdown for one choice (owner: some scouting fields read better as a dropdown than a row of
// chips). Base UI Select underneath: a native-feeling list, keyboard and screen-reader support.
// `size="form"` is the 56 pt scouting-form height (gloves, ui-design-system §6.4).
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export interface DropdownOption<TValue extends string> {
  value: TValue
  label: string
}

export function Dropdown<TValue extends string>({
  label,
  options,
  value,
  onValueChange,
  placeholder = "Choose…",
  size = "default",
  describedBy,
}: {
  label: string
  options: ReadonlyArray<DropdownOption<TValue>>
  value: TValue | null
  onValueChange: (value: TValue) => void
  placeholder?: string
  size?: "default" | "form"
  describedBy?: string
}) {
  const selected = options.find((o) => o.value === value)
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v !== null) onValueChange(v)
      }}
    >
      <SelectTrigger
        aria-label={label}
        aria-describedby={describedBy}
        className={cn(
          "w-full rounded-2xl bg-card text-body shadow-xs",
          size === "form" ? "h-14! px-4" : "h-11! px-3"
        )}
      >
        <SelectValue>{selected ? selected.label : placeholder}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            className="min-h-11 text-body"
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
