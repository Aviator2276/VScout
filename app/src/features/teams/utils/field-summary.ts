// Answers from a game form as label/value lines (Pit and Post sub-views). Labels and option names
// come from the game module, so nothing here knows the season (ADR-009).
import { allFields } from "@/games/kit/fields"
import { t } from "@/games/kit/labels"
import type { FieldDef, FormDef, GameDefinition } from "@/games/types"

export interface AnswerLine {
  id: string
  label: string
  value: string
}

function describe(
  game: GameDefinition,
  field: FieldDef,
  value: unknown
): string | null {
  if (value === undefined) return null
  if (value === null) return "Didn’t see"
  switch (field.kind) {
    case "boolean": {
      const yes = value === true
      const label = yes ? field.trueLabel : field.falseLabel
      if (label) return t(game, label)
      return yes ? "Yes" : "No"
    }
    case "choice": {
      const o = field.options.find((x) => x.value === value)
      return o ? t(game, o.label) : String(value)
    }
    case "multiChoice":
      return Array.isArray(value)
        ? value
            .map((v) => {
              const o = field.options.find((x) => x.value === v)
              return o ? t(game, o.label) : String(v)
            })
            .join(", ") || "None"
        : null
    case "rating":
      return `${String(value)} of ${field.scale}`
    case "duration": {
      const b = field.buckets.find((x) => x.value === value)
      return b ? t(game, b.label) : String(value)
    }
    case "number":
      return `${String(value)}${field.unit ? ` ${field.unit}` : ""}`
    case "incidents":
      return Array.isArray(value) ? `${value.length}` : null
    case "fieldPosition": {
      const z = field.zones?.find((x) => x.id === value)
      return z ? t(game, z.label) : null
    }
    case "count":
    case "text":
      return typeof value === "string" || typeof value === "number"
        ? String(value)
        : null
  }
}

export function summarize(
  game: GameDefinition,
  form: FormDef,
  data: Readonly<Record<string, unknown>>
): Array<AnswerLine> {
  return allFields(form).flatMap((f) => {
    const value = describe(game, f, data[f.id])
    return value === null || value === ""
      ? []
      : [{ id: f.id, label: t(game, f.label), value }]
  })
}
