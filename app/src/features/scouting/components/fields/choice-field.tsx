// choice → Segmented (up to 5 short options); otherwise wrapping chips in the match form (one tap,
// time pressure) and a dropdown in the pit and post forms (owner: chips took too much room), or
// whatever the game module asks for with `display` (ui-patterns §2.2).
import { ChoiceChips } from "@/components/controls/choice-chips"
import { Dropdown } from "@/components/controls/dropdown"
import { Segmented } from "@/components/controls/segmented"
import { t } from "@/games/kit/labels"
import type { ChoiceField as ChoiceDef } from "@/games/types"
import { useFormEnv } from "../form-context"
import { FieldFrame } from "./field-frame"
import { UNKNOWN, UNKNOWN_LABEL } from "./field-props"
import type { FieldProps } from "./field-props"

const SEGMENTED_MAX = 5
const SHORT_LABEL = 12

export function ChoiceField({
  field,
  value,
  onChange,
  label,
  help,
  issue,
}: FieldProps<ChoiceDef>) {
  const { game, alliance } = useFormEnv()
  const options = [
    ...field.options.map((o) => ({ value: o.value, label: t(game, o.label) })),
    ...(field.allowUnknown ? [{ value: UNKNOWN, label: UNKNOWN_LABEL }] : []),
  ]
  const selected =
    value === null && field.allowUnknown
      ? UNKNOWN
      : typeof value === "string"
        ? value
        : null
  const set = (v: string) => onChange(v === UNKNOWN ? null : v)
  const segmented =
    field.display !== "list" &&
    field.display !== "grid" &&
    options.length <= SEGMENTED_MAX &&
    options.every((o) => o.label.length <= SHORT_LABEL)
  // the match form has an alliance; pit and post forms don't
  const dropdown =
    field.display === "dropdown" ||
    (!segmented &&
      field.display !== "list" &&
      field.display !== "grid" &&
      alliance === null)
  return (
    <FieldFrame label={label} help={help} issue={issue}>
      {(describedBy) =>
        dropdown ? (
          <Dropdown
            describedBy={describedBy}
            label={label}
            options={options}
            value={selected}
            onValueChange={set}
            size="form"
          />
        ) : segmented ? (
          <Segmented
            describedBy={describedBy}
            label={label}
            options={options}
            value={selected}
            onValueChange={set}
            size="form"
          />
        ) : (
          <ChoiceChips
            describedBy={describedBy}
            label={label}
            options={options}
            value={selected}
            onValueChange={set}
            size="form"
          />
        )
      }
    </FieldFrame>
  )
}
