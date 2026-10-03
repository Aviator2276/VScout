// rating → 1..scale segments with the anchor words under the ends, so every scouter rates
// against the same words (game-module.md RatingField).
import { Segmented } from "@/components/controls/segmented"
import { t } from "@/games/kit/labels"
import type { RatingField as RatingDef } from "@/games/types"
import { useFormEnv } from "../form-context"
import { FieldFrame } from "./field-frame"
import type { FieldProps } from "./field-props"

const NA = "na"
export const NA_LABEL = "N/A"

export function RatingField({
  field,
  value,
  onChange,
  label,
  help,
  issue,
}: FieldProps<RatingDef>) {
  const { game } = useFormEnv()
  const options = [
    ...Array.from({ length: field.scale }, (_, i) => ({
      value: String(i + 1),
      label: String(i + 1),
    })),
    ...(field.allowNA ? [{ value: NA, label: NA_LABEL }] : []),
  ]
  const selected =
    typeof value === "number"
      ? String(value)
      : value === null && field.allowNA
        ? NA
        : null
  const low = t(game, field.anchors.low)
  const high = t(game, field.anchors.high)
  const mid = field.anchors.mid ? t(game, field.anchors.mid) : null
  return (
    <FieldFrame
      label={label}
      help={[help, `1 = ${low}, ${field.scale} = ${high}`]
        .filter(Boolean)
        .join(" ")}
      issue={issue}
    >
      {(describedBy) => (
        <div className="flex flex-col gap-1">
          <Segmented
            describedBy={describedBy}
            label={label}
            options={options}
            value={selected}
            onValueChange={(v) => onChange(v === NA ? null : Number(v))}
            size="form"
          />
          <div
            aria-hidden
            className="grid grid-cols-3 text-caption-1 text-muted-foreground"
          >
            <span>{low}</span>
            <span className="text-center">{mid}</span>
            <span className="text-right">{high}</span>
          </div>
        </div>
      )}
    </FieldFrame>
  )
}
