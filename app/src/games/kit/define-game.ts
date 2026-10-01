// Helpers for writing a season module. `defineGame` is an identity function: modules write
// `defineGame({...})` and keep literal types inside, app code sees the wide GameDefinition.
import type { GameDefinition, LabelKey, OptionDef } from "../types"

export function defineGame<const TGame extends GameDefinition>(
  game: TGame
): TGame {
  return game
}

/** Options whose labels follow `${prefix}.${value}`: options("auto.climb", ["none", "level1"]). */
export function options(
  prefix: LabelKey,
  values: ReadonlyArray<string>
): ReadonlyArray<OptionDef> {
  return values.map((value) => ({ value, label: `${prefix}.${value}` }))
}
