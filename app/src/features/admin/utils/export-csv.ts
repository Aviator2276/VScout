// Export (features/admin.md AD7, criterion 14): one row per entry, columns labelled by the game
// module's labels, then a second header row with the field ids. Built from Dexie, so it works offline.
import { allFields } from "@/games/kit/fields"
import type { GameDefinition } from "@/games/types"
import { fieldLabels } from "./field-labels"

export interface ExportEntry {
  id: string
  matchKey: string
  teamNumber: number
  station: string
  authorName: string
  createdAt: number
  data: Readonly<Record<string, unknown>>
}

const cell = (v: unknown): string => {
  if (v === undefined || v === null) return ""
  const s =
    Array.isArray(v) || typeof v === "object" ? JSON.stringify(v) : String(v)
  // RFC 4180 quoting; a leading = + - @ is neutralized so spreadsheets don't run it as a formula
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function entriesCsv(
  game: GameDefinition,
  entries: ReadonlyArray<ExportEntry>
): string {
  const fields = allFields(game.matchForm)
  const labels = fieldLabels(game)
  const fixed = [
    ["Match", "matchKey"],
    ["Team", "teamNumber"],
    ["Station", "station"],
    ["Scouter", "author"],
    ["Saved", "createdAt"],
  ] as const
  const head1 = [
    ...fixed.map(([l]) => l),
    ...fields.map((f) => labels.field(f.id)),
  ]
  const head2 = [...fixed.map(([, id]) => id), ...fields.map((f) => f.id)]
  const rows = entries.map((e) => [
    e.matchKey,
    e.teamNumber,
    e.station,
    e.authorName,
    new Date(e.createdAt).toISOString(),
    ...fields.map((f) => {
      const v = e.data[f.id]
      return typeof v === "string" ? labels.value(f.id, v) : v
    }),
  ])
  return (
    [head1, head2, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") +
    "\r\n"
  )
}
