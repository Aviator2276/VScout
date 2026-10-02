// iOS switch (Konsta Toggle: a real checkbox inside a label). The label text is required and becomes
// the accessible name; show it visibly next to the switch in the row (List.Toggle does).
import { Toggle } from "konsta/react"

export interface SwitchProps {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean | undefined
}

export function Switch({
  label,
  checked,
  onCheckedChange,
  disabled,
}: SwitchProps) {
  return (
    <Toggle
      checked={checked}
      disabled={disabled}
      onChange={(e: { target: { checked: boolean } }) =>
        onCheckedChange(e.target.checked)
      }
      colors={{ checkedBgIos: "bg-primary" }}
      className="shrink-0"
    >
      <span className="sr-only">{label}</span>
    </Toggle>
  )
}
