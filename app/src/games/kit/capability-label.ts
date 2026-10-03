// How a capability's value reads (teams.md T2 criterion 20): the pit field's option label, never the
// stored value ("Level 3", not `level3`). Numbers (an observed maximum) read as themselves.
import type { CapabilityDef, GameDefinition } from "../types"
import { allFields } from "./fields"
import { t } from "./labels"

export function capabilityValueLabel(
  game: GameDefinition,
  cap: CapabilityDef,
  value: string | number | null | undefined
): string | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") return String(value)
  if (!("pitField" in cap.source)) return value
  const id = cap.source.pitField
  const field = allFields(game.pitForm).find((f) => f.id === id)
  if (field && (field.kind === "choice" || field.kind === "multiChoice")) {
    const option = field.options.find((o) => o.value === value)
    if (option) return t(game, option.label)
  }
  return value
}
