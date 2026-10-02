// text → a text area (or one line) with structured quick tags under it (ui-patterns §2.5). Tags are
// stored separately from the text (game-module.md §3), so "all #defense notes" is a query.
import { ChipGroup } from "@/components/controls/chip-group"
import { TextArea, TextField } from "@/components/form/text-field"
import { t } from "@/games/kit/labels"
import type { TextField as TextDef } from "@/games/types"
import { useFormEnv } from "../form-context"
import type { FieldProps } from "./field-props"

export function TextEntryField({
  field,
  value,
  onChange,
  label,
  help,
  issue,
  tags,
  onTagsChange,
}: FieldProps<TextDef> & {
  tags: ReadonlyArray<string>
  onTagsChange: (tags: Array<string>) => void
}) {
  const { game } = useFormEnv()
  const text = typeof value === "string" ? value : ""
  const set = (next: string) => onChange(next === "" ? null : next)
  const nearLimit = text.length >= field.maxLength * 0.8
  const description =
    [help, nearLimit ? `${text.length} of ${field.maxLength} characters` : null]
      .filter(Boolean)
      .join(" ") || undefined
  const common = {
    label,
    value: text,
    onValueChange: set,
    maxLength: field.maxLength,
    ...(field.placeholder ? { placeholder: t(game, field.placeholder) } : {}),
    ...(description ? { description } : {}),
    ...(issue ? { errors: [issue] } : {}),
  }
  return (
    <div className="flex flex-col gap-3 py-3">
      {field.multiline ? (
        <TextArea {...common} rows={4} />
      ) : (
        <TextField {...common} />
      )}
      {field.quickTags && field.quickTags.length > 0 ? (
        <ChipGroup
          label={`${label} tags`}
          options={field.quickTags.map((o) => ({
            value: o.value,
            label: t(game, o.label),
          }))}
          value={tags}
          onValueChange={onTagsChange}
        />
      ) : null}
    </div>
  )
}
