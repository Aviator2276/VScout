// fieldPosition → tap a zone on the field drawing, mirrored for the red alliance. Point mode
// isn't used by any season yet; it falls back to listing nothing and says so.
import { ZoneMap } from "@/components/controls/zone-map"
import { t } from "@/games/kit/labels"
import type { FieldPositionField as FieldPositionDef } from "@/games/types"
import { useFormEnv } from "../form-context"
import { FieldFrame } from "./field-frame"
import type { FieldProps } from "./field-props"

export function FieldPositionField({
  field,
  value,
  onChange,
  label,
  help,
  issue,
}: FieldProps<FieldPositionDef>) {
  const { game, alliance } = useFormEnv()
  const image = game.assets.images[field.image]
  if (field.mode !== "zone" || !field.zones || !image)
    return (
      <FieldFrame
        label={label}
        issue="This field can't be shown on this device yet."
      >
        {() => null}
      </FieldFrame>
    )
  return (
    <FieldFrame label={label} help={help} issue={issue}>
      {(describedBy) => (
        <ZoneMap
          describedBy={describedBy}
          label={label}
          image={{ ...image, alt: t(game, image.alt) }}
          zones={
            field.zones?.map((z) => ({ ...z, label: t(game, z.label) })) ?? []
          }
          value={typeof value === "string" ? value : null}
          onValueChange={onChange}
          mirror={field.mirrorForAlliance && alliance === "red"}
        />
      )}
    </FieldFrame>
  )
}
