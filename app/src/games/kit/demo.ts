// Demo data from any game's form descriptors (features/admin.md AD7a): a robot's "skill" (0..1)
// shapes its counts and ratings, and fields that other fields depend on usually take the value that
// shows the most of the form (a demo no-show on every robot would be dull). Nothing here knows the
// game: it walks FieldDefs, so a new season gets demo data for free. Same seed → same data.
import type { FieldDef, FormDef, GameDefinition, OptionDef } from "../types"
import {
  allFields,
  appliesTo,
  conditionFields,
  isRequired,
  isVisible,
} from "./fields"
import type { FormContext } from "./fields"

export type Rng = () => number

/** mulberry32: a small, fast seeded generator (0 ≤ n < 1). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = <T>(rng: Rng, list: ReadonlyArray<T>): T => {
  const item = list[Math.floor(rng() * list.length)]
  if (item === undefined) throw new Error("pick from an empty list")
  return item
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** A skill-weighted option: good tones for strong robots, bad ones for weak robots. */
function pickOption(
  rng: Rng,
  options: ReadonlyArray<OptionDef>,
  skill: number
): string {
  const weight = (o: OptionDef) =>
    o.tone === "good" ? 0.2 + skill : o.tone === "bad" ? 1.2 - skill : 0.6
  const total = options.reduce((s, o) => s + weight(o), 0)
  let r = rng() * total
  for (const o of options) {
    r -= weight(o)
    if (r <= 0) return o.value
  }
  return options[options.length - 1]?.value ?? ""
}

function valueFor(
  field: FieldDef,
  rng: Rng,
  skill: number,
  required: boolean
): unknown {
  const noisy = () => clamp01(skill + (rng() - 0.5) * 0.5)
  switch (field.kind) {
    case "choice":
      return pickOption(rng, field.options, skill)
    case "multiChoice": {
      const max = Math.min(field.max ?? field.options.length, 2)
      const n = Math.floor(rng() * (max + 1))
      const values = new Set<string>()
      for (let i = 0; i < n; i++) values.add(pick(rng, field.options).value)
      if (required && values.size === 0 && field.options[0])
        values.add(field.options[0].value)
      return [...values]
    }
    case "boolean":
      return rng() < 0.25 + skill * 0.5
    case "count": {
      const step = field.step ?? 1
      const span = (field.max - field.min) * 0.7
      const raw = field.min + span * noisy()
      return Math.min(
        field.max,
        field.min + Math.round((raw - field.min) / step) * step
      )
    }
    case "number": {
      if (field.min === undefined || field.max === undefined)
        return required ? (field.min ?? 1) : null
      const n = field.min + (field.max - field.min) * rng()
      return field.integer ? Math.round(n) : Math.round(n * 10) / 10
    }
    case "rating":
      return 1 + Math.round((field.scale - 1) * noisy())
    case "duration":
      return pick(rng, field.buckets).value
    case "fieldPosition":
      if (field.mode === "zone")
        return field.zones?.length ? pick(rng, field.zones).id : null
      return {
        x: Math.round(rng() * 100) / 100,
        y: Math.round(rng() * 100) / 100,
      }
    case "text":
      return required ? "Demo note" : null
    case "incidents":
      return []
  }
}

/**
 * Valid form data for a demo robot. Fields that gate others (visibleWhen) take the value that keeps
 * the most fields visible nine times in ten; the rest are drawn from the robot's skill.
 */
export function demoFormData(
  form: FormDef,
  ctx: FormContext,
  rng: Rng,
  skill: number
): Record<string, unknown> {
  const fields = allFields(form).filter((f) => appliesTo(f, ctx))
  const gates = new Set(
    fields.flatMap((f) => (f.visibleWhen ? conditionFields(f.visibleWhen) : []))
  )
  const data: Record<string, unknown> = {}
  fields.forEach((field, i) => {
    if (!isVisible(field, data)) return
    const required = isRequired(field, ctx.level)
    let value = valueFor(field, rng, skill, required)
    if (gates.has(field.id) && rng() < 0.9) {
      const later = fields.slice(i + 1)
      const candidates: Array<unknown> =
        field.kind === "boolean"
          ? [true, false]
          : field.kind === "choice"
            ? field.options.map((o) => o.value)
            : [value]
      const shown = (v: unknown) =>
        later.filter((f) => isVisible(f, { ...data, [field.id]: v })).length
      const best = Math.max(...candidates.map(shown))
      if (shown(value) < best)
        value = candidates.find((v) => shown(v) === best) ?? value
    }
    data[field.id] = value
  })
  return data
}

/** The three forms' demo payloads for one robot, ready for the wire records. */
export function demoEntries(
  game: Pick<GameDefinition, "matchForm" | "pitForm" | "postForm">,
  rng: Rng,
  skill: number
) {
  const ctx: FormContext = { level: "experienced", stage: "qual" }
  return {
    match: () => demoFormData(game.matchForm, ctx, rng, skill),
    pit: () => demoFormData(game.pitForm, ctx, rng, skill),
    post: () => demoFormData(game.postForm, ctx, rng, skill),
  }
}
