// Prematch card field summaries (game-module.md PrematchSectionDef): across a team's scouted
// matches, the most common answer ("mode"), the tags used ("tags"), or the latest answer.
import { allFields } from "@/games/kit/fields"
import { t } from "@/games/kit/labels"
import type { FieldDef, GameDefinition } from "@/games/types"

function label(game: GameDefinition, field: FieldDef, v: unknown): string {
  if (field.kind === "choice" || field.kind === "multiChoice") {
    const o = field.options.find((x) => x.value === v)
    return o ? t(game, o.label) : String(v)
  }
  if (typeof v === "boolean") return v ? "Yes" : "No"
  return typeof v === "string" || typeof v === "number" ? String(v) : "—"
}

export function summarizeField(
  game: GameDefinition,
  fieldId: string,
  how: "mode" | "tags" | "latest",
  entries: ReadonlyArray<{
    data: Readonly<Record<string, unknown>>
    tags?: ReadonlyArray<string>
    createdAt: number
  }>
): string | null {
  const field = [...allFields(game.matchForm), ...allFields(game.pitForm)].find(
    (f) => f.id === fieldId
  )
  if (!field) return null
  const values = [...entries]
    .sort((a, b) => a.createdAt - b.createdAt)
    .flatMap((e) => {
      const v = e.data[fieldId]
      if (v === undefined || v === null) return []
      return Array.isArray(v) ? (v as Array<unknown>) : [v]
    })
  if (how === "tags") {
    const tags = [...new Set(entries.flatMap((e) => e.tags ?? []))]
    return tags.length ? tags.join(", ") : null
  }
  if (values.length === 0) return null
  if (how === "latest") return label(game, field, values.at(-1))
  const counts = new Map<string, { v: unknown; n: number }>()
  for (const v of values) {
    const k = JSON.stringify(v)
    const c = counts.get(k)
    if (c) c.n++
    else counts.set(k, { v, n: 1 })
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0]
  return best
    ? `${label(game, field, best.v)} (${best.n} of ${values.length})`
    : null
}
