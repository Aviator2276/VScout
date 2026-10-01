// Purging old events and tombstones (data-layer §7.9). Never deletes unsynced work.
import type { VScoutDB } from "./schema"

const EVENT_TABLES = [
  "eventTeams",
  "matches",
  "scoutEntries",
  "pitScouting",
  "postScouting",
  "allianceRanks",
  "comments",
  "messages",
  "reactions",
  "picklists",
  "picklistEntries",
  "allianceSims",
  "adminAudit",
  "mediaVideos",
  "mediaAssets",
  "tombstones",
] as const

const OWNED_TABLES = [
  "scoutEntries",
  "pitScouting",
  "postScouting",
  "allianceRanks",
  "comments",
  "messages",
  "reactions",
  "picklists",
  "picklistEntries",
  "mediaAssets",
] as const

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

export type PurgeResult =
  { ok: true; deleted: number } | { ok: false; reason: "unsynced-work" }

export async function purgeEvent(
  db: VScoutDB,
  eventKey: string
): Promise<PurgeResult> {
  let unsynced =
    (await db.outbox.where("eventKey").equals(eventKey).count()) +
    (await db.drafts.where("eventKey").equals(eventKey).count()) +
    (await db.conflicts
      .where("eventKey")
      .equals(eventKey)
      .filter((c) => c.status === "open")
      .count())
  // any owned row that isn't synced is the only copy of someone's work
  for (const name of OWNED_TABLES)
    unsynced += await db
      .table<{ syncState?: string }>(name)
      .where("eventKey")
      .equals(eventKey)
      .filter((r) => r.syncState !== "synced")
      .count()
  if (unsynced > 0) return { ok: false, reason: "unsynced-work" }

  let deleted = 0
  for (const name of EVENT_TABLES) {
    // chunked so one purge never blocks the UI thread for long
    for (;;) {
      const keys = await db
        .table(name)
        .where("eventKey")
        .equals(eventKey)
        .limit(2000)
        .primaryKeys()
      if (keys.length === 0) break
      await db.table(name).bulkDelete(keys)
      deleted += keys.length
    }
  }
  await db.eventSettings.delete(eventKey)
  await db.allianceBoards.delete(eventKey)
  await db.syncCursors.where("scope").equals(`event:${eventKey}`).delete()
  return { ok: true, deleted }
}

/** Synced tombstones older than 30 days (server cursors expire before that anyway). */
export async function purgeOldTombstones(
  db: VScoutDB,
  now: number
): Promise<number> {
  return db.tombstones
    .where("deletedAt")
    .below(now - THIRTY_DAYS)
    .filter((t) => t.syncState === "synced")
    .delete()
}

/** Resolved conflicts are deleted after 7 days (data-layer §11). */
export async function purgeResolvedConflicts(
  db: VScoutDB,
  now: number
): Promise<number> {
  return db.conflicts
    .where("status")
    .equals("resolved")
    .filter((c) => (c.resolvedAt ?? 0) < now - 7 * 24 * 60 * 60 * 1000)
    .delete()
}
