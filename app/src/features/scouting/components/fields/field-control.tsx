// FieldDef.kind → its control (game-module.md §4.2). Adding a kind means adding a case here; the
// switch is exhaustive, so a new kind is a type error until it renders.
import type { FieldDef } from "@/games/types"
import { BooleanField } from "./boolean-field"
import { ChoiceField } from "./choice-field"
import { CountField } from "./count-field"
import { DurationField } from "./duration-field"
import { FieldPositionField } from "./field-position-field"
import type { FieldProps } from "./field-props"
import { IncidentsField } from "./incidents-field"
import { MultiChoiceField } from "./multi-choice-field"
import { NumberField } from "./number-field"
import { RatingField } from "./rating-field"
import { TextEntryField } from "./text-entry-field"

export function FieldControl(
  p: FieldProps<FieldDef> & {
    tags: ReadonlyArray<string>
    onTagsChange: (tags: Array<string>) => void
  }
) {
  const { field, tags, onTagsChange, ...rest } = p
  switch (field.kind) {
    case "choice":
      return <ChoiceField field={field} {...rest} />
    case "multiChoice":
      return <MultiChoiceField field={field} {...rest} />
    case "boolean":
      return <BooleanField field={field} {...rest} />
    case "count":
      return <CountField field={field} {...rest} />
    case "number":
      return <NumberField field={field} {...rest} />
    case "rating":
      return <RatingField field={field} {...rest} />
    case "duration":
      return <DurationField field={field} {...rest} />
    case "fieldPosition":
      return <FieldPositionField field={field} {...rest} />
    case "text":
      return (
        <TextEntryField
          field={field}
          tags={tags}
          onTagsChange={onTagsChange}
          {...rest}
        />
      )
    case "incidents":
      return <IncidentsField field={field} {...rest} />
  }
}
