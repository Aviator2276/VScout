// Derived team metrics for 2026 (game-module.md §5). Pure: same input → same output.
import {
  MIN_SAMPLE,
  confidenceFrom,
  entriesIn,
  notEnough,
  rateWhere,
  reliabilityFromIncidents,
} from "../kit/metrics"
import { mean, round, stdev } from "../kit/stats"
import type {
  IncidentValue,
  MetricDef,
  MetricInput,
  MetricResult,
} from "../types"
import { incidents } from "./incidents"

const num = (v: unknown): number | null => (typeof v === "number" ? v : null)

/** 1 − normalized stdev of a per-match composite (mean of the core ratings, 1–5). */
function consistency(input: MetricInput): MetricResult {
  const composites = entriesIn(input).flatMap((e) => {
    const parts = [
      num(e.data["teleop.scoringRating"]),
      num(e.data["auto.effectiveness"]),
    ].filter((v): v is number => v !== null)
    const m = mean(parts)
    return m === null ? [] : [m]
  })
  if (composites.length < MIN_SAMPLE) return notEnough(composites.length)
  // the largest possible stdev on a 1–5 scale is 2
  const value = Math.max(0, 1 - (stdev(composites) ?? 0) / 2)
  return {
    value: round(value),
    sampleSize: composites.length,
    confidence: confidenceFrom(composites.length),
    breakdown: [
      {
        label: "metric.consistency.composite",
        value: round(mean(composites) ?? 0, 2),
      },
    ],
  }
}

const DEFENSIVE = new Set(["defense", "mixed"])

function defense(input: MetricInput): MetricResult {
  const entries = entriesIn(input)
  const defended = entries.filter((e) =>
    DEFENSIVE.has(String(e.data["teleop.role"]))
  )
  const ratings = defended.flatMap((e) => {
    const r = num(e.data["teleop.defenseRating"])
    return r === null ? [] : [r]
  })
  if (ratings.length < MIN_SAMPLE) return notEnough(ratings.length)
  return {
    value: round(mean(ratings) ?? 0, 2),
    sampleSize: ratings.length,
    confidence: confidenceFrom(ratings.length),
    breakdown: [
      {
        label: "metric.defense.rate",
        value: round(
          rateWhere((d) => DEFENSIVE.has(String(d["teleop.role"])), entries) ??
            0
        ),
      },
    ],
  }
}

function autoEffectiveness(input: MetricInput): MetricResult {
  const entries = entriesIn(input)
  const ratings = entries.flatMap((e) => {
    const r = num(e.data["auto.effectiveness"])
    return r === null ? [] : [r]
  })
  if (ratings.length < MIN_SAMPLE) return notEnough(ratings.length)
  const withAutoIncident = entries.filter((e) => {
    const list = e.data.incidents
    return (
      Array.isArray(list) &&
      (list as Array<IncidentValue>).some((i) => i.phase === "auto")
    )
  }).length
  const incidentRate = withAutoIncident / entries.length
  return {
    value: round((mean(ratings) ?? 0) * (1 - incidentRate), 2),
    sampleSize: ratings.length,
    confidence: confidenceFrom(ratings.length),
    breakdown: [
      {
        label: "metric.autoEffectiveness.incidentRate",
        value: round(incidentRate),
      },
      {
        label: "metric.autoEffectiveness.climbRate",
        value: round(
          rateWhere((d) => d["auto.climb"] === "level1", entries) ?? 0
        ),
      },
    ],
  }
}

export const metrics = [
  {
    id: "reliability",
    label: "metric.reliability",
    description: "metric.reliability.desc",
    format: "percent",
    higherIsBetter: true,
    compute: reliabilityFromIncidents(incidents, {
      incidentsField: "incidents",
      noShowField: "pre.noShow",
    }),
  },
  {
    id: "consistency",
    label: "metric.consistency",
    description: "metric.consistency.desc",
    format: "percent",
    higherIsBetter: true,
    compute: consistency,
  },
  {
    id: "defense",
    label: "metric.defense",
    description: "metric.defense.desc",
    format: "score5",
    higherIsBetter: true,
    compute: defense,
  },
  {
    id: "autoEffectiveness",
    label: "metric.autoEffectiveness",
    description: "metric.autoEffectiveness.desc",
    format: "score5",
    higherIsBetter: true,
    compute: autoEffectiveness,
  },
] as const satisfies ReadonlyArray<MetricDef>
