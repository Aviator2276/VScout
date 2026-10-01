// Applies a module's migration chain to stored entry data (game-module.md §6, ADR-022).
import type { GameDefinition } from "../types"

export type MigrationResult =
  | { status: "current"; data: Record<string, unknown>; schemaVersion: number }
  | { status: "migrated"; data: Record<string, unknown>; schemaVersion: number }
  /** written by a newer app: keep raw, show "Update the app to see this entry" */
  | {
      status: "unsupported"
      data: Record<string, unknown>
      schemaVersion: number
    }

export function runMigrations(
  game: Pick<GameDefinition, "schemaVersion" | "migrations">,
  data: Record<string, unknown>,
  fromVersion: number
): MigrationResult {
  if (fromVersion > game.schemaVersion)
    return { status: "unsupported", data, schemaVersion: fromVersion }
  if (fromVersion === game.schemaVersion)
    return { status: "current", data, schemaVersion: fromVersion }
  let current = data
  for (let v = fromVersion; v < game.schemaVersion; v++) {
    const step = game.migrations[v]
    if (!step) throw new Error(`Missing migration ${v} → ${v + 1}`)
    current = step(current)
  }
  return {
    status: "migrated",
    data: current,
    schemaVersion: game.schemaVersion,
  }
}
