// The 2–4 metric columns on the team list (teams.md "Columns"): the user's choice from
// userSettings.teamListColumns, else the game's defaults. Labels come from the game (ADR-009).
import { t } from "@/games/kit/labels"
import type { ColumnDef, GameDefinition } from "@/games/types"
import type { TeamMetrics } from "@/lib/metrics/event-team-metrics"
import { formatMetric, formatValue } from "@/lib/metrics/format-metric"
import type { FormattedMetric } from "@/lib/metrics/format-metric"

export interface Column {
  id: string
  label: string
  read: (m: TeamMetrics | undefined) => FormattedMetric
}

const NO_DATA: FormattedMetric = { text: "—", label: "No data", missing: true }

function toColumn(game: GameDefinition, def: ColumnDef): Column {
  const label = t(game, def.label)
  const src = def.source
  if ("metric" in src) {
    const metric = game.metrics.find((m) => m.id === src.metric)
    return {
      id: def.id,
      label,
      read: (m) =>
        formatMetric(metric?.format ?? "number", m?.metrics[src.metric]),
    }
  }
  if ("external" in src)
    return {
      id: def.id,
      label,
      read: (m) => {
        const v = m?.external[src.external]
        if (v === null || v === undefined) return NO_DATA
        const text = formatValue("external", v)
        return { text, label: text, missing: false }
      },
    }
  return {
    id: def.id,
    label,
    read: (m) => {
      const v = m?.capabilityValues[src.capability]
      if (v === null || v === undefined) return NO_DATA
      const text = typeof v === "string" ? t(game, v) : formatValue("number", v)
      return { text, label: text, missing: false }
    },
  }
}

export function availableColumns(game: GameDefinition): Array<Column> {
  return game.teamListColumns.map((d) => toColumn(game, d))
}

export function resolveColumns(
  game: GameDefinition,
  chosen: ReadonlyArray<string> | undefined
): Array<Column> {
  const all = availableColumns(game)
  const picked = chosen
    ?.map((id) => all.find((c) => c.id === id))
    .filter((c): c is Column => c !== undefined)
  if (picked && picked.length >= 2) return picked.slice(0, 4)
  const defaults = game.teamListColumns.filter((d) => d.defaultVisible)
  return all.filter((c) => defaults.some((d) => d.id === c.id)).slice(0, 4)
}
