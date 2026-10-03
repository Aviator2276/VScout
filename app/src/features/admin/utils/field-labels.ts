// Game labels for a match-form field and its option values (export headers, validation flags).
import { allFields } from "@/games/kit/fields"
import { t } from "@/games/kit/labels"
import type { GameDefinition } from "@/games/types"

export function fieldLabels(game: GameDefinition) {
  const fields = new Map(allFields(game.matchForm).map((f) => [f.id, f]))
  return {
    field: (id: string) => {
      const f = fields.get(id)
      return f ? t(game, f.label) : id
    },
    value: (id: string, value: string) => {
      const f = fields.get(id)
      const opt =
        f && "options" in f
          ? f.options.find((o) => o.value === value)
          : undefined
      return opt ? t(game, opt.label) : value
    },
  }
}
