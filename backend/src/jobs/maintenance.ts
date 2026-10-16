// Daily pruning (REQUIREMENTS §13.3): change-log rows superseded or deleted more than 30 days ago,
// idempotency records after 7 days (we keep 8), ended sessions, dead push subscriptions.
import type { Db } from "../db/db.js"
import { HORIZON_KEY } from "../domain/sync.js"
import type { Clock } from "../lib/clock.js"

export const LOG_RETENTION_MS = 30 * 86_400_000

/** Returns how many change-log rows were removed. Clients with older cursors get 410 cursor_expired. */
export function pruneChangeLog(db: Db, clock: Clock): number {
  const cutoff = clock.now() - LOG_RETENTION_MS
  return db.tx(() => {
    const rows = db.all<{ seq: number }>(
      `SELECT c.seq FROM change_log c
       WHERE c.created_at < ? AND (
         c.op = 'delete' OR
         EXISTS (SELECT 1 FROM change_log n WHERE n.scope = c.scope AND n.entity = c.entity
                 AND n.record_id = c.record_id AND n.seq > c.seq))`,
      cutoff
    )
    if (!rows.length) return 0
    const max = Math.max(...rows.map((r) => r.seq))
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => r.seq)
      db.run(`DELETE FROM change_log WHERE seq IN (${chunk.map(() => "?").join(",")})`, ...chunk)
    }
    const prev = Number(db.getMeta(HORIZON_KEY) ?? 0)
    db.setMeta(HORIZON_KEY, String(Math.max(prev, max)))
    return rows.length
  })
}
