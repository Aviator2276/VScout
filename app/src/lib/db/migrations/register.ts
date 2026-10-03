// Registers every schema version on a Dexie instance, oldest first (data-layer §6).
// Keep each version that has an upgrade function until no client is below it.
import type { Dexie } from "dexie"
import * as v001 from "./v001"
import * as v002 from "./v002"

export const LATEST_VERSION = 2

export function registerVersions(db: Dexie): void {
  db.version(1).stores(v001.stores)
  db.version(2).stores(v002.stores)
}
