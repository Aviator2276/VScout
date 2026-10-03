// multiChoice → chips (ui-patterns §2.3). At `max`, the unselected chips are disabled.
import { ChipGroup } from "@/components/controls/chip-group"
import { t } from "@/games/kit/labels"
import type { MultiChoiceField as MultiChoiceDef } from "@/games/types"
import { useFormEnv } from "../form-context"
import { FieldFrame } from "./field-frame"
import type { FieldProps } from "./field-props"

export function MultiChoiceField({
  field,
  value,
  onChange,
  label,
  help,
  issue,
}: FieldProps<MultiChoiceDef>) {
  const { game } = useFormEnv()
  const selected = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : []
  const full = field.max !== undefined && selected.length >= field.max
  return (
    <FieldFrame
      label={label}
      help={full ? `Pick up to ${field.max}.` : help}
      issue={issue}
    >
      {(describedBy) => (
        <ChipGroup
          describedBy={describedBy}
          label={label}
          options={field.options.map((o) => ({
            value: o.value,
            label: t(game, o.label),
            disabled: full,
          }))}
          value={selected}
          onValueChange={onChange}
          size="form"
        />
      )}
    </FieldFrame>
  )
}
