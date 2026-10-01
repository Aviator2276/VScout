// Game payloads on ingest (data-layer §5): migrate older versions to the current one, validate,
// flag newer/unknown ones as unsupported. Never drop a record: the server is the source of record.
import { formOf, stageOfMatchKey } from "@/games/kit/fields"
import { runMigrations } from "@/games/kit/migrate"
import { deriveFormSchema } from "@/games/kit/schema"
import type { GameDefinition, ScouterLevel } from "@/games/types"
import { logger } from "@/lib/logger"

export type GameLookup = (gameId: string) => GameDefinition | null

export interface PayloadRecord {
  gameId: string
  schemaVersion: number
  data: Record<string, unknown>
  scouterLevel?: ScouterLevel
  matchKey?: string
  unsupported?: true
}

export function ingestGamePayload<TRecord extends PayloadRecord>(
  record: TRecord,
  form: "match" | "pit" | "post",
  games: GameLookup
): TRecord {
  const game = games(record.gameId)
  if (!game) {
    logger.warn("sync", "unknown game module; stored as unsupported", {
      gameId: record.gameId,
    })
    return { ...record, unsupported: true }
  }
  const migrated = runMigrations(game, record.data, record.schemaVersion)
  if (migrated.status === "unsupported") return { ...record, unsupported: true }

  const schema = deriveFormSchema(game, formOf(game, form), {
    level: record.scouterLevel ?? "experienced",
    stage: stageOfMatchKey(record.matchKey),
  })
  const check = schema.safeParse(migrated.data)
  if (!check.success)
    // stored anyway; the admin Data Quality screen surfaces it (features/admin.md AD4)
    logger.warn("sync", "game payload failed validation", {
      gameId: record.gameId,
      issues: check.error.issues.slice(0, 5),
    })
  const { unsupported: _flag, ...rest } = record
  return {
    ...rest,
    data: migrated.data,
    schemaVersion: migrated.schemaVersion,
  } as TRecord
}
