// Metric chips on picklist rows (scout-tab.md A): two values per team from the game's
// picklistHints for the list's purpose. App layer: it joins the game module with event metrics.
import { activeGame } from "@/config/game"
import { t } from "@/games/kit/labels"
import type { TeamMetrics } from "@/lib/metrics/event-team-metrics"
import { formatMetric } from "@/lib/metrics/format-metric"

export function picklistChips(
  purpose: string,
  metrics: ReadonlyMap<number, TeamMetrics> | null
) {
  const hints = (
    purpose === "second"
      ? activeGame.picklistHints.second
      : activeGame.picklistHints.first
  ).slice(0, 2)
  return (team: number) =>
    hints.flatMap((id) => {
      const m = metrics?.get(team)
      const metric = activeGame.metrics.find((x) => x.id === id)
      if (metric) {
        const f = formatMetric(metric.format, m?.metrics[id])
        return [{ label: t(activeGame, metric.label), value: f.text }]
      }
      const cap = activeGame.capabilities.find((c) => c.id === id)
      if (cap) {
        const v = m?.capabilityValues[id]
        const s = m?.capabilities[id]
        const value =
          v !== undefined && v !== null
            ? typeof v === "string"
              ? t(activeGame, v)
              : String(v)
            : s?.claimed || s?.observed
              ? "Yes"
              : "—"
        return [{ label: t(activeGame, cap.label), value }]
      }
      return []
    })
}
