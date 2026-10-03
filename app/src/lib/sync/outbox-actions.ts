// What the Sync sheet can do to a change that hasn't uploaded yet (features/sync-status.md S3):
// retry now, or discard a new record that was never sent. Updates can't be discarded here: there's
// no server copy on this device to go back to.
import type { VScoutDB } from "@/lib/db/schema"
import type { OutboxOp } from "@/lib/db/types"
import type { EntityName } from "@/lib/contracts/entities"
import { ENTITY_DEFS } from "./entity-registry"

/** Clear the backoff so the next sync sends it at once. */
export async function retryNow(
  db: VScoutDB,
  op: Pick<OutboxOp, "seq" | "state">,
  now: number
): Promise<void> {
  if (op.seq === undefined) return
  if (op.state !== "queued" && op.state !== "blocked") return
  await db.outbox.update(op.seq, { nextAttemptAt: now })
}

/** A new record never sent: the server has never seen it, so it can simply go. */
export function canDiscard(op: OutboxOp): boolean {
  return (
    op.kind === "create" &&
    op.state === "queued" &&
    op.attempts === 0 &&
    op.sealedBody === undefined
  )
}

export async function discardUnsentCreate(
  db: VScoutDB,
  op: OutboxOp
): Promise<boolean> {
  if (!canDiscard(op)) return false
  const def = ENTITY_DEFS[op.entity as EntityName] as
    (typeof ENTITY_DEFS)[EntityName] | undefined
  if (!def) return false
  await db.transaction("rw", [db.outbox, db.table(def.table)], async () => {
    // every op on the record (a create plus later edits coalesce, but be thorough)
    await db.outbox.where("recordKey").equals(op.recordKey).delete()
    await db.table(def.table).delete(def.key(op.recordId))
  })
  return true
}
