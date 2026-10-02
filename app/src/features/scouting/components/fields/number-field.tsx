// number → a numeric input with its unit in the label (pit measurements).
import { useState } from "react"
import { TextField } from "@/components/form/text-field"
import type { NumberField as NumberDef } from "@/games/types"
import type { FieldProps } from "./field-props"

const UNITS = { lb: "lb", in: "in", kg: "kg", cm: "cm", yr: "years" } as const

export function parseNumberInput(raw: string, integer: boolean): number | null {
  const text = raw.trim().replace(",", ".")
  if (text === "") return null
  const n = Number(text)
  if (!Number.isFinite(n)) return null
  return integer ? Math.trunc(n) : n
}

export function NumberField({
  field,
  value,
  onChange,
  label,
  help,
  issue,
}: FieldProps<NumberDef>) {
  // keep what's typed ("12." mid-entry) separate from the stored number
  const [text, setText] = useState(
    typeof value === "number" ? String(value) : ""
  )
  const unit = field.unit ? ` (${UNITS[field.unit]})` : ""
  return (
    <div className="py-3">
      <TextField
        label={`${label}${unit}`}
        value={text}
        onValueChange={(raw) => {
          setText(raw)
          onChange(parseNumberInput(raw, field.integer === true))
        }}
        inputMode={field.integer ? "numeric" : "decimal"}
        {...(help ? { description: help } : {})}
        {...(issue ? { errors: [issue] } : {})}
      />
    </div>
  )
}
