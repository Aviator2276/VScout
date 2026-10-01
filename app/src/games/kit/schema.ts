// Descriptor → zod (game-module.md §4.1). The same schema validates form submit, incoming entry
// payloads and migrated entries. Hidden fields must be absent or null; unknown keys are rejected.
import { z } from "zod"
import type {
  FieldDef,
  FormDef,
  GameDefinition,
  IncidentTaxonomy,
  ScouterLevel,
} from "../types"
import { allFields, appliesTo, isRequired, isVisible } from "./fields"
import type { FormContext } from "./fields"

function enumOf(values: ReadonlyArray<string>) {
  return z.enum(values as [string, ...Array<string>])
}

export function incidentSchema(
  incidents: IncidentTaxonomy,
  level: ScouterLevel
) {
  const nullableEnum = (values: ReadonlyArray<string>) =>
    enumOf(values).nullable()
  const strictForNew = (values: ReadonlyArray<string>) =>
    level === "new" ? enumOf(values) : nullableEnum(values)
  return z.strictObject({
    id: z.string().min(1),
    phase: enumOf(incidents.phases),
    type: strictForNew(incidents.types.map((t) => t.value)),
    category: nullableEnum(incidents.categories.map((c) => c.value)),
    length: strictForNew(incidents.lengths.map((l) => l.value)),
    resolution: nullableEnum(incidents.resolutions.map((r) => r.value)),
    resolutionNote: z.string().max(500).nullable(),
    note: z.string().max(500).nullable(),
  })
}

export function fieldSchema(
  field: FieldDef,
  game: Pick<GameDefinition, "incidents">,
  level: ScouterLevel
): z.ZodType {
  switch (field.kind) {
    case "choice":
      return enumOf(field.options.map((o) => o.value)).nullable()
    case "multiChoice":
      return z
        .array(enumOf(field.options.map((o) => o.value)))
        .max(field.max ?? field.options.length)
    case "boolean":
      return z.boolean().nullable()
    case "count":
      return z.number().int().min(field.min).max(field.max)
    case "number": {
      let n = field.integer ? z.number().int() : z.number()
      if (field.min !== undefined) n = n.min(field.min)
      if (field.max !== undefined) n = n.max(field.max)
      return n.nullable()
    }
    case "rating":
      return z.number().int().min(1).max(field.scale).nullable()
    case "duration":
      return enumOf(field.buckets.map((b) => b.value)).nullable()
    case "fieldPosition":
      return field.mode === "zone"
        ? enumOf((field.zones ?? []).map((zone) => zone.id)).nullable()
        : z
            .object({
              x: z.number().min(0).max(1),
              y: z.number().min(0).max(1),
            })
            .nullable()
    case "text":
      return z.string().max(field.maxLength).nullable()
    case "incidents":
      return z.array(incidentSchema(game.incidents, level))
  }
}

function requireValue(schema: z.ZodType): z.ZodType {
  return schema.refine(
    (v) =>
      v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0),
    {
      message: "Required",
    }
  )
}

const cache = new Map<string, z.ZodType<Record<string, unknown>>>()

export function deriveFormSchema(
  game: Pick<GameDefinition, "id" | "schemaVersion" | "incidents">,
  form: FormDef,
  ctx: FormContext
): z.ZodType<Record<string, unknown>> {
  const key = `${game.id}:${game.schemaVersion}:${form.id}:${ctx.level}:${ctx.stage}`
  const hit = cache.get(key)
  if (hit) return hit

  const fields = allFields(form).filter((f) => appliesTo(f, ctx))
  const shape: Record<string, z.ZodType> = {}
  for (const f of fields)
    shape[f.id] = fieldSchema(f, game, ctx.level).optional()

  const schema = z.strictObject(shape).superRefine((data, issue) => {
    for (const f of fields) {
      const visible = isVisible(f, data)
      const value = data[f.id]
      if (!visible) {
        if (
          value !== undefined &&
          value !== null &&
          !(Array.isArray(value) && value.length === 0)
        )
          issue.addIssue({
            code: "custom",
            path: [f.id],
            message: "Hidden field must be empty",
          })
        continue
      }
      if (
        isRequired(f, ctx.level) &&
        !requireValue(z.unknown()).safeParse(value).success
      )
        issue.addIssue({ code: "custom", path: [f.id], message: "Required" })
    }
  }) as unknown as z.ZodType<Record<string, unknown>>
  cache.set(key, schema)
  return schema
}

/** Drafts never block: same field types, nothing required, hidden values tolerated. */
export function draftSchema(
  game: Pick<GameDefinition, "incidents">,
  form: FormDef,
  ctx: FormContext
): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType> = {}
  for (const f of allFields(form).filter((x) => appliesTo(x, ctx)))
    shape[f.id] = fieldSchema(f, game, ctx.level).optional()
  return z.strictObject(shape)
}
