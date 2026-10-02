// boolean → a switch row, or Yes / No / Didn't see when the scouter may not have seen it.
import { Segmented } from "@/components/controls/segmented"
import { Switch } from "@/components/controls/switch"
import { t } from "@/games/kit/labels"
import type { BooleanField as BooleanDef } from "@/games/types"
import { useFormEnv } from "../form-context"
import { FieldFrame } from "./field-frame"
import { UNKNOWN, UNKNOWN_LABEL } from "./field-props"
import type { FieldProps } from "./field-props"

export function BooleanField({
  field,
  value,
  onChange,
  label,
  help,
  issue,
}: FieldProps<BooleanDef>) {
  const { game } = useFormEnv()
  if (!field.allowUnknown)
    return (
      <div className="flex items-center justify-between gap-3 py-3">
        <div>
          <p className="text-subhead font-medium">{label}</p>
          {help ? (
            <p className="text-footnote text-muted-foreground">{help}</p>
          ) : null}
          {issue ? (
            <p className="text-footnote text-destructive">{issue}</p>
          ) : null}
        </div>
        <Switch
          label={label}
          checked={value === true}
          onCheckedChange={onChange}
        />
      </div>
    )
  const options = [
    { value: "yes", label: field.trueLabel ? t(game, field.trueLabel) : "Yes" },
    { value: "no", label: field.falseLabel ? t(game, field.falseLabel) : "No" },
    { value: UNKNOWN, label: UNKNOWN_LABEL },
  ]
  const selected =
    value === true
      ? "yes"
      : value === false
        ? "no"
        : value === null
          ? UNKNOWN
          : null
  return (
    <FieldFrame label={label} help={help} issue={issue}>
      {(describedBy) => (
        <Segmented
          describedBy={describedBy}
          label={label}
          options={options}
          value={selected}
          onValueChange={(v) =>
            onChange(v === "yes" ? true : v === "no" ? false : null)
          }
          size="form"
        />
      )}
    </FieldFrame>
  )
}
