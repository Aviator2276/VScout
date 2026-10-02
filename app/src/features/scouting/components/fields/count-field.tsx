// count → stepper with 56 pt buttons (ui-patterns §2.4). Starts at the minimum.
import { CountStepper } from "@/components/controls/count-stepper"
import type { CountField as CountDef } from "@/games/types"
import { FieldFrame } from "./field-frame"
import type { FieldProps } from "./field-props"

export function CountField({
  field,
  value,
  onChange,
  label,
  help,
  issue,
}: FieldProps<CountDef>) {
  return (
    <FieldFrame label={label} help={help} issue={issue}>
      {() => (
        <CountStepper
          label={label}
          value={typeof value === "number" ? value : field.min}
          onValueChange={onChange}
          min={field.min}
          max={field.max}
          {...(field.step ? { step: field.step } : {})}
        />
      )}
    </FieldFrame>
  )
}
