// iOS switch (Konsta Toggle: a real checkbox inside a label). The label text is required and becomes
// the accessible name; show it visibly next to the switch in the row (List.Toggle does).
import { Toggle } from "konsta/react"

export interface SwitchProps {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean | undefined
  /** form = a 56 pt hit area (scouting forms) */
  size?: "default" | "form"
}

export function Switch({
  label,
  checked,
  onCheckedChange,
  disabled,
  size = "default",
}: SwitchProps) {
  return (
    <Toggle
      checked={checked}
      disabled={disabled}
      onChange={(e: { target: { checked: boolean } }) =>
        onCheckedChange(e.target.checked)
      }
      colors={{ checkedBgIos: "bg-primary" }}
      // the label is the target; hit-44 / hit-56 grow it from 64×28 (ui-design-system §6.4)
      className={size === "form" ? "hit-56 shrink-0" : "hit-44 shrink-0"}
    >
      <span className="sr-only">{label}</span>
    </Toggle>
  )
}
