// Outbox: the queue of local writes (data-layer §8.2). Bodies of unsealed ops aren't stored; the
// push path builds them from the current record at send time, so coalesced edits send the latest
// state. Call only inside a transaction that includes db.outbox.
import type { VScoutDB } from "@/lib/db/schema"
import type { OutboxKind, OutboxOp } from "@/lib/db/types"
import { recordKey } from "./entity-registry"

export interface EnqueueInput {
  opId: string
  userId: string
  entity: string
  recordId: string
  eventKey: string | null
  kind: OutboxKind
  dependsOn?: Array<string>
  patchKeys?: Array<string>
  reason?: string
  now: number
}

/**
 * - `appended`: a new op was queued
 * - `coalesced`: merged into the record's last unsealed queued op
 * - `dropped-create`: a delete cancelled a create the server never saw (no tombstone needed)
 */
export type EnqueueResult = "appended" | "coalesced" | "dropped-create"

export async function opsFor(
  db: VScoutDB,
  entity: string,
  recordId: string
): Promise<Array<OutboxOp>> {
  return db.outbox
    .where("recordKey")
    .equals(recordKey(entity, recordId))
    .sortBy("seq")
}

export async function enqueue(
  db: VScoutDB,
  input: EnqueueInput
): Promise<EnqueueResult> {
  const existing = await opsFor(db, input.entity, input.recordId)
  const last = existing.at(-1)
  const open =
    last && last.state === "queued" && last.sealedBody === undefined
      ? last
      : undefined

  if (open?.seq !== undefined) {
    if (open.kind === "create" && input.kind === "update") return "coalesced"
    if (open.kind === "create" && input.kind === "delete") {
      await db.outbox.delete(open.seq)
      return "dropped-create"
    }
    if (open.kind === "update" && input.kind === "update") {
      if (input.patchKeys)
        await db.outbox.update(open.seq, {
          patchKeys: [
            ...new Set([...(open.patchKeys ?? []), ...input.patchKeys]),
          ],
        })
      return "coalesced"
    }
    if (open.kind === "update" && input.kind === "delete") {
      await db.outbox.update(open.seq, {
        kind: "delete",
        patchKeys: undefined,
        ...(input.reason ? { reason: input.reason } : {}),
      })
      return "coalesced"
    }
  }

  await db.outbox.add({
    opId: input.opId,
    userId: input.userId,
    entity: input.entity,
    recordId: input.recordId,
    recordKey: recordKey(input.entity, input.recordId),
    eventKey: input.eventKey,
    kind: input.kind,
    ...(input.dependsOn ? { dependsOn: input.dependsOn } : {}),
    ...(input.patchKeys ? { patchKeys: input.patchKeys } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    state: "queued",
    attempts: 0,
    nextAttemptAt: input.now,
    createdAt: input.now,
  })
  return "appended"
}

/** Boot recovery (v1's stuck "uploading"): an app killed mid-send leaves ops inflight. */
export async function resetInflightOps(db: VScoutDB): Promise<number> {
  return db.outbox.where("state").equals("inflight").modify({ state: "queued" })
}
