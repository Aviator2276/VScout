// Walking descriptors: which fields exist, which apply to a scouter level and competition stage,
// and which are visible for the current values.
import type {
  CompLevelScope,
  Condition,
  FieldDef,
  FormDef,
  GameDefinition,
  ScouterLevel,
} from "../types"

export interface FormContext {
  level: ScouterLevel
  stage: CompLevelScope
}

export function allFields(form: FormDef): Array<FieldDef> {
  return form.sections.flatMap((s) => s.fields)
}

export function appliesTo(field: FieldDef, ctx: FormContext): boolean {
  const modeOk = !field.modes || field.modes.includes(ctx.level)
  const stageOk = !field.stages || field.stages.includes(ctx.stage)
  return modeOk && stageOk
}

export function isRequired(field: FieldDef, level: ScouterLevel): boolean {
  if (field.required === undefined || field.required === false) return false
  if (field.required === true) return true
  return field.required.modes.includes(level)
}

/** Evaluates a declarative visibleWhen condition against form values. */
export function evaluate(
  condition: Condition,
  data: Readonly<Record<string, unknown>>
): boolean {
  if ("all" in condition) return condition.all.every((c) => evaluate(c, data))
  if ("any" in condition) return condition.any.some((c) => evaluate(c, data))
  const value = data[condition.field]
  if ("eq" in condition) return value === condition.eq
  if ("in" in condition) return condition.in.some((v) => v === value)
  return Boolean(value)
}

export function isVisible(
  field: FieldDef,
  data: Readonly<Record<string, unknown>>
): boolean {
  return !field.visibleWhen || evaluate(field.visibleWhen, data)
}

/** Field ids referenced by a condition (for the contract test's ordering check). */
export function conditionFields(condition: Condition): Array<string> {
  if ("all" in condition) return condition.all.flatMap(conditionFields)
  if ("any" in condition) return condition.any.flatMap(conditionFields)
  return [condition.field]
}

/** The form that validates a record's payload. */
export function formOf(game: GameDefinition, form: FormDef["id"]): FormDef {
  return form === "match"
    ? game.matchForm
    : form === "pit"
      ? game.pitForm
      : game.postForm
}

/** Qualification vs playoff from a TBA match key (`…_qm12` is a qual). */
export function stageOfMatchKey(matchKey: unknown): CompLevelScope {
  return typeof matchKey === "string" && !/_qm\d+$/.test(matchKey)
    ? "playoff"
    : "qual"
}
