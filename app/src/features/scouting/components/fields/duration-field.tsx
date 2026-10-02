// duration → buckets, never a stopwatch (v1 lesson G1).
import { ChoiceChips } from "@/components/controls/choice-chips"
import { Segmented } from "@/components/controls/segmented"
import { t } from "@/games/kit/labels"
import type { DurationField as DurationDef } from "@/games/types"
import { useFormEnv } from "../form-context"
import { FieldFrame } from "./field-frame"
import type { FieldProps } from "./field-props"

export function DurationField({
  field,
  value,
  onChange,
  label,
  help,
  issue,
}: FieldProps<DurationDef>) {
  const { game } = useFormEnv()
  const options = field.buckets.map((b) => ({
    value: b.value,
    label: t(game, b.label),
  }))
  const selected = typeof value === "string" ? value : null
  return (
    <FieldFrame label={label} help={help} issue={issue}>
      {(describedBy) =>
        options.length <= 4 ? (
          <Segmented
            describedBy={describedBy}
            label={label}
            options={options}
            value={selected}
            onValueChange={onChange}
            size="form"
          />
        ) : (
          <ChoiceChips
            describedBy={describedBy}
            label={label}
            options={options}
            value={selected}
            onValueChange={onChange}
            size="form"
          />
        )
      }
    </FieldFrame>
  )
}
