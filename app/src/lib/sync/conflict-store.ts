// Writing conflict rows (data-layer §11). Used by the pull path (applyEnvelope) and the push path.
// Call inside a transaction over [conflicts, outbox, the entity table].
import type { VScoutDB } from "@/lib/db/schema"
import type { ConflictKind, ConflictRow } from "@/lib/db/types"
import { recordKey } from "./entity-registry"

export interface ConflictInput {
  entity: string
  recordId: string
  eventKey: string | null
  kind: ConflictKind
  source: "push" | "pull"
  local: unknown
  remote: unknown
  baseRev: number
  remoteRev: number | null
  serverErrors?: ConflictRow["serverErrors"]
}

/** One open conflict per record: a newer server copy updates the existing row. */
export async function recordConflict(
  db: VScoutDB,
  input: ConflictInput,
  deps: { now: number; newId: () => string }
): Promise<ConflictRow> {
  const ops = await db.outbox
    .where("recordKey")
    .equals(recordKey(input.entity, input.recordId))
    .toArray()
  const blockedOpIds = ops.map((o) => o.opId)
  await db.outbox
    .where("recordKey")
    .equals(recordKey(input.entity, input.recordId))
    .modify({ state: "blocked" })

  const open = await db.conflicts
    .where("[entity+recordId]")
    .equals([input.entity, input.recordId])
    .filter((c) => c.status === "open")
    .first()

  const row: ConflictRow = {
    id: open?.id ?? deps.newId(),
    entity: input.entity,
    recordId: input.recordId,
    eventKey: input.eventKey,
    kind: input.kind,
    source: input.source,
    detectedAt: deps.now,
    status: "open",
    local: open?.local ?? input.local,
    remote: input.remote,
    baseRev: open?.baseRev ?? input.baseRev,
    remoteRev: input.remoteRev,
    ...(input.serverErrors ? { serverErrors: input.serverErrors } : {}),
    blockedOpIds,
  }
  await db.conflicts.put(row)
  return row
}
