// Multi-scouter consolidation (ADR-042): several entries for one (match, team) become one view.
// Per kind: choice/duration/position → most common answer; boolean → majority; numbers → mean;
// multiChoice → options picked by at least half; text → first non-empty; incidents → the
// longest list (scouters log the same incident, so a union would double count).
import type { FieldDef, FieldId, FormDef, ScoutEntryView } from "../types"
import { allFields } from "./fields"
import { mean, round } from "./stats"

function mode(values: ReadonlyArray<unknown>): unknown {
  const counts = new Map<string, { value: unknown; n: number }>()
  for (const v of values) {
    const key = JSON.stringify(v)
    const c = counts.get(key)
    if (c) c.n++
    else counts.set(key, { value: v, n: 1 })
  }
  let best: { value: unknown; n: number } | undefined
  for (const c of counts.values()) if (!best || c.n > best.n) best = c
  return best?.value
}

function merge(field: FieldDef, values: ReadonlyArray<unknown>): unknown {
  const present = values.filter((v) => v !== undefined && v !== null)
  if (present.length === 0) return values.includes(null) ? null : undefined
  switch (field.kind) {
    case "count":
    case "number":
    case "rating":
      return round(
        mean(present.filter((v): v is number => typeof v === "number")) ?? 0,
        2
      )
    case "multiChoice": {
      const lists = present.filter((v): v is Array<string> => Array.isArray(v))
      const all = new Set(lists.flat())
      return [...all].filter(
        (o) => lists.filter((l) => l.includes(o)).length * 2 >= lists.length
      )
    }
    case "text":
      return (
        present.find((v) => typeof v === "string" && v.trim() !== "") ?? null
      )
    case "incidents":
      return present.reduce<Array<unknown>>(
        (best, v) => (Array.isArray(v) && v.length > best.length ? v : best),
        []
      )
    case "choice":
    case "boolean":
    case "duration":
    case "fieldPosition":
      return mode(present)
  }
}

export function consolidate(
  form: FormDef,
  matchKey: string,
  entries: ReadonlyArray<{ data: Readonly<Record<FieldId, unknown>> }>
): ScoutEntryView {
  const data: Record<FieldId, unknown> = {}
  const disagreements: Array<FieldId> = []
  for (const field of allFields(form)) {
    const values = entries.map((e) => e.data[field.id])
    const merged = merge(field, values)
    if (merged !== undefined) data[field.id] = merged
    const distinct = new Set(
      values.filter((v) => v !== undefined).map((v) => JSON.stringify(v))
    )
    if (distinct.size > 1) disagreements.push(field.id)
  }
  return { matchKey, data, scouterCount: entries.length, disagreements }
}
