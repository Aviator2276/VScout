// Scouting form values (game-module.md §3–§4). Entries store a flat record keyed by FieldId
// ("auto.moved"), but TanStack Form reads dots as nested paths, so inside the form every id is
// encoded with "/" instead of "." (no FieldId contains "/").
import { allFields, appliesTo, isVisible } from "@/games/kit/fields"
import type { FormContext } from "@/games/kit/fields"
import { deriveFormSchema } from "@/games/kit/schema"
import type { FieldId, FormDef, GameDefinition } from "@/games/types"

export interface EntryValues {
  data: Record<FieldId, unknown>
  /** quick tags attached to text fields (game-module.md §3) */
  tags: Record<FieldId, Array<string>>
}

export const toKey = (id: FieldId): string => {
  if (id.includes("/") || id.includes("[") || id.includes("]"))
    throw new Error(`FieldId can't contain "/", "[" or "]": ${id}`)
  return id.replaceAll(".", "/")
}
export const fromKey = (key: string): FieldId => key.replaceAll("/", ".")

function mapKeys<TValue>(
  record: Readonly<Record<string, TValue>>,
  fn: (key: string) => string
): Record<string, TValue> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [fn(k), v]))
}

export const encodeValues = (v: EntryValues): EntryValues => ({
  data: mapKeys(v.data, toKey),
  tags: mapKeys(v.tags, toKey),
})
export const decodeValues = (v: EntryValues): EntryValues => ({
  data: mapKeys(v.data, fromKey),
  tags: mapKeys(v.tags, fromKey),
})

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  (Array.isArray(value) && value.length === 0)

/**
 * Drops values of fields that don't apply (another level or stage) or are hidden by their
 * condition, repeating until stable (hiding one field can hide another). The schema rejects them.
 */
export function pruneHidden(
  form: FormDef,
  ctx: FormContext,
  data: Readonly<Record<FieldId, unknown>>
): Record<FieldId, unknown> {
  let current: Record<FieldId, unknown> = { ...data }
  const known = new Set(allFields(form).map((f) => f.id))
  for (const key of Object.keys(current))
    if (!known.has(key)) delete current[key]
  for (;;) {
    const next = { ...current }
    for (const f of allFields(form))
      if (
        (!appliesTo(f, ctx) || !isVisible(f, current)) &&
        !isEmpty(next[f.id])
      )
        delete next[f.id]
    if (Object.keys(next).length === Object.keys(current).length) return next
    current = next
  }
}

/**
 * Starting values for controls that can't show "not answered": a plain switch is off (false) and a
 * counter starts at its minimum. Choices, ratings and tri-state booleans stay unset (ui-patterns
 * §2.2: unset is a real state).
 */
export function withControlDefaults(
  form: FormDef,
  data: Readonly<Record<FieldId, unknown>>
): Record<FieldId, unknown> {
  const out: Record<FieldId, unknown> = { ...data }
  for (const f of allFields(form)) {
    if (out[f.id] !== undefined) continue
    if (f.kind === "boolean" && !f.allowUnknown) out[f.id] = false
    if (f.kind === "count") out[f.id] = f.min
  }
  return out
}

export interface ReviewIssue {
  fieldId: FieldId
  sectionId: string
  message: string
}

/** What stops a submit, per section (ui-patterns §2.1: listed on Review, never blocking stages). */
export function reviewIssues(
  game: Pick<GameDefinition, "id" | "schemaVersion" | "incidents">,
  form: FormDef,
  ctx: FormContext,
  data: Readonly<Record<FieldId, unknown>>
): Array<ReviewIssue> {
  const sectionOf = new Map<FieldId, string>()
  for (const s of form.sections)
    for (const f of s.fields) sectionOf.set(f.id, s.id)
  const result = deriveFormSchema(game, form, ctx).safeParse(
    pruneHidden(form, ctx, data)
  )
  if (result.success) return []
  const seen = new Set<string>()
  const issues: Array<ReviewIssue> = []
  for (const issue of result.error.issues) {
    const fieldId = String(issue.path[0] ?? "")
    if (!sectionOf.has(fieldId) || seen.has(fieldId)) continue
    seen.add(fieldId)
    issues.push({
      fieldId,
      sectionId: sectionOf.get(fieldId) ?? "",
      message: issue.message === "Required" ? "Required" : "Check this answer",
    })
  }
  const order = allFields(form).map((f) => f.id)
  return issues.sort(
    (a, b) => order.indexOf(a.fieldId) - order.indexOf(b.fieldId)
  )
}

/** Sections with a missing or invalid answer (the stage pill's warning mark). */
export function sectionsWithIssues(
  issues: ReadonlyArray<ReviewIssue>
): ReadonlySet<string> {
  return new Set(issues.map((i) => i.sectionId))
}
