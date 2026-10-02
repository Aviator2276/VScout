// How a metric value reads in lists and cards (game-module.md §5 MetricDef.format). Null means
// "not enough data" and always says how much data there is (teams.md criterion 12).
import type { MetricDef } from "@/games/types"
import type { MetricCell } from "./event-team-metrics"

export interface FormattedMetric {
  text: string
  /** the accessible reading when the text alone isn't enough ("Not enough data (1 match)") */
  label: string
  missing: boolean
}

const plural = (n: number) => `${n} ${n === 1 ? "match" : "matches"}`

export function formatMetric(
  format: MetricDef["format"],
  cell: MetricCell | undefined
): FormattedMetric {
  if (!cell) return { text: "—", label: "No data", missing: true }
  if ("error" in cell)
    return { text: "!", label: "Couldn’t compute", missing: true }
  if (cell.value === null)
    return {
      text: "—",
      label: `Not enough data (${plural(cell.sampleSize)})`,
      missing: true,
    }
  const text = formatValue(format, cell.value)
  return { text, label: text, missing: false }
}

export function formatValue(
  format: MetricDef["format"] | "external",
  value: number | string
): string {
  if (typeof value === "string") return value
  switch (format) {
    case "percent":
      return `${Math.round(value * 100)}%`
    case "score5":
      return value.toFixed(1)
    case "number":
    case "label":
    case "external":
      return Number.isInteger(value) ? String(value) : value.toFixed(1)
  }
}
