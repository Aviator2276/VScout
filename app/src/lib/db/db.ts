// The app's database. Lazy: nothing touches IndexedDB until first use, so the build-time shell
// prerender (Node) never opens it (routing-auth §1). Tests use createDb() with a unique name.
import { logger } from "@/lib/logger"
import { VScoutDB } from "./schema"

/** v1 used "vscout" (schema 18) on the same origin; v2 never opens it (ADR-019). */
export const DB_NAME = "vscout2"

export function createDb(name: string = DB_NAME): VScoutDB {
  const db = new VScoutDB(name)
  // Another tab upgraded the schema: close so it isn't blocked; the UI asks for a reload.
  db.on("versionchange", () => {
    logger.warn("db", "versionchange: closing for another tab's upgrade")
    db.close()
    return false
  })
  return db
}

let instance: VScoutDB | null = null

export function getDb(): VScoutDB {
  instance ??= createDb()
  return instance
}
