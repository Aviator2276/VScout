// ChangeEnvelope (ADR-015/017, http-api-contract §0.1, mqtt-contract §5.1). Identical on the
// change log and MQTT data topics. `data` is decoded per entity by lib/api/adapters
// (normalize → schema → domain), so backend drift is fixed in one place (ADR-071).
import { z } from "zod"
import { entityName } from "./entities"
import type { EntityName, WireRecord } from "./entities"
import { isoDateTime, recordId } from "./primitives"

/** Envelope header; `data` is decoded per entity by lib/api/adapters/change-envelope-adapter. */
export const changeEnvelopeHeader = z.looseObject({
  v: z.literal(1),
  entity: entityName,
  op: z.enum(["upsert", "delete"]),
  id: z.string().min(1),
  rev: z.number().int().min(1),
  eventKey: z.string().nullable(),
  ts: isoDateTime,
  actorId: recordId.optional(),
  opId: recordId.optional(),
  data: z.unknown().optional(),
})

export type ChangeEnvelope<TEntity extends EntityName = EntityName> = {
  [TKey in TEntity]: Omit<
    z.infer<typeof changeEnvelopeHeader>,
    "entity" | "data"
  > & {
    entity: TKey
    data?: WireRecord<TKey>
  }
}[TEntity]
