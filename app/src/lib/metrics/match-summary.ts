// One robot's scouting in one match, as the game's short summary cells (ADR-078, game.detailPage):
// T2 Matches columns and the M2 played line. Several scouts on one robot are consolidated first, like
// the metrics. Pure and game-agnostic.
import { consolidate } from "@/games/kit/consolidate"
import { allFields } from "@/games/kit/fields"
import { t } from "@/games/kit/labels"
import type { FieldDef, GameDefinition } from "@/games/types"

export interface SummaryColumn {
  id: string
  /** short column name ("Auto") */
  label: string
}

export interface SummaryCell extends SummaryColumn {
  /** "4", "Level 3", "—" when the scout didn't answer */
  value: string
}

export function summaryColumns(game: GameDefinition): Array<SummaryColumn> {
  return (game.detailPage?.matchSummary ?? []).map((s) => ({
    id: s.field,
    label: t(game, s.label),
  }))
}

function short(game: GameDefinition, field: FieldDef, v: unknown): string {
  if (v === undefined || v === null) return "—"
  switch (field.kind) {
    case "choice": {
      const o = field.options.find((x) => x.value === v)
      return o ? t(game, o.label) : String(v)
    }
    case "boolean":
      return v === true ? "Yes" : "No"
    case "incidents":
    case "multiChoice":
      return Array.isArray(v) ? String(v.length) : "—"
    case "duration": {
      const b = field.buckets.find((x) => x.value === v)
      return b ? t(game, b.label) : String(v)
    }
    case "rating":
    case "count":
    case "number":
      return typeof v === "number" ? String(v) : "—"
    case "fieldPosition":
    case "text":
      return typeof v === "string" ? v : "—"
  }
}

/** The summary cells for one robot in one match, or null when nobody scouted it. */
export function matchSummary(
  game: GameDefinition,
  matchKey: string,
  entries: ReadonlyArray<{
    matchKey: string
    data: Readonly<Record<string, unknown>>
    unsupported?: boolean
  }>
): Array<SummaryCell> | null {
  const mine = entries.filter((e) => e.matchKey === matchKey && !e.unsupported)
  if (mine.length === 0) return null
  const view = consolidate(game.matchForm, matchKey, mine)
  const fields = new Map(allFields(game.matchForm).map((f) => [f.id, f]))
  return summaryColumns(game).flatMap((c) => {
    const field = fields.get(c.id)
    return field ? [{ ...c, value: short(game, field, view.data[c.id]) }] : []
  })
}
