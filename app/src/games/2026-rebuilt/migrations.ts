import type { EntryMigration } from "../types"

// schemaVersion 1 is the first: nothing to migrate yet. migrations[N] maps N → N+1.
export const migrations: Readonly<Record<number, EntryMigration>> = {}
