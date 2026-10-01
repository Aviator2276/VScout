// Registers every schema version on a Dexie instance, oldest first (data-layer §6).
// Keep each version that has an upgrade function until no client is below it.
import type { Dexie } from "dexie"
import * as v001 from "./v001"

export const LATEST_VERSION = 1

export function registerVersions(db: Dexie): void {
  db.version(1).stores(v001.stores)
}
