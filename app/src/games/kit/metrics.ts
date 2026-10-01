// Reusable metric builders (game-module.md §5). Every builder returns a pure compute function.
import type {
  FieldId,
  IncidentTaxonomy,
  IncidentValue,
  MetricInput,
  MetricResult,
  ScoutEntryView,
} from "../types"
import { mean, round, windowed } from "./stats"

export const MIN_SAMPLE = 2

export function confidenceFrom(
  n: number,
  disagreements = 0
): MetricResult["confidence"] {
  const penalty = disagreements > n ? 1 : 0
  if (n >= 8) return penalty ? "medium" : "high"
  if (n >= 4) return penalty ? "low" : "medium"
  return "low"
}

export function notEnough(sampleSize: number): MetricResult {
  return { value: null, sampleSize, confidence: "low" }
}

export function entriesIn(input: MetricInput): Array<ScoutEntryView> {
  return windowed(input.entries, input.window)
}

function numbersOf(
  entries: ReadonlyArray<ScoutEntryView>,
  field: FieldId
): Array<number> {
  return entries.flatMap((e) => {
    const v = e.data[field]
    return typeof v === "number" ? [v] : []
  })
}

/** Mean of a rating field over entries where it was answered. */
export function meanRating(field: FieldId, minSample = MIN_SAMPLE) {
  return (input: MetricInput): MetricResult => {
    const entries = entriesIn(input)
    const values = numbersOf(entries, field)
    if (values.length < minSample) return notEnough(values.length)
    const disagreements = entries.filter((e) =>
      e.disagreements.includes(field)
    ).length
    return {
      value: round(mean(values) ?? 0),
      sampleSize: values.length,
      confidence: confidenceFrom(values.length, disagreements),
    }
  }
}

function incidentsOf(
  entry: ScoutEntryView,
  field: FieldId
): Array<IncidentValue> {
  const v = entry.data[field]
  return Array.isArray(v) ? (v as Array<IncidentValue>) : []
}

/**
 * 1 − (matches with a reliability-relevant incident, or a no-show) / matches.
 * Incidents whose type doesn't count, or whose length is ignored (e.g. 'brief'), don't count.
 */
export function reliabilityFromIncidents(
  taxonomy: IncidentTaxonomy,
  opts: { incidentsField: FieldId; noShowField?: FieldId; minSample?: number }
) {
  const counts = new Set(
    taxonomy.types.filter((t) => t.countsAgainstReliability).map((t) => t.value)
  )
  const ignored = new Set(taxonomy.ignoreLengthsForReliability)
  return (input: MetricInput): MetricResult => {
    const entries = entriesIn(input)
    const n = entries.length
    if (n < (opts.minSample ?? MIN_SAMPLE)) return notEnough(n)
    let bad = 0
    let electrical = 0
    for (const e of entries) {
      const noShow = opts.noShowField
        ? e.data[opts.noShowField] === true
        : false
      const relevant = incidentsOf(e, opts.incidentsField).filter(
        (i) =>
          (i.type === null || counts.has(i.type)) &&
          (i.length === null || !ignored.has(i.length))
      )
      electrical += relevant.filter((i) => i.category === "electrical").length
      if (noShow || relevant.length > 0) bad++
    }
    return {
      value: round(1 - bad / n),
      sampleSize: n,
      confidence: confidenceFrom(n),
      breakdown: [
        { label: "metric.reliability.badMatches", value: bad },
        { label: "metric.reliability.electrical", value: electrical },
      ],
    }
  }
}

/** Share of entries where `predicate` holds (e.g. role is defense). */
export function rateWhere(
  predicate: (data: Readonly<Record<FieldId, unknown>>) => boolean,
  entries: ReadonlyArray<ScoutEntryView>
): number | null {
  if (entries.length === 0) return null
  return entries.filter((e) => predicate(e.data)).length / entries.length
}
