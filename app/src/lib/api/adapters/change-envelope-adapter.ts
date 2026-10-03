// ChangeEnvelope (wire) → DomainChange. Used for MQTT data topics, /sync/changes pages and
// write responses alike, so every path decodes records the same way.
import type { z } from "zod"
import { changeEnvelopeHeader } from "@/lib/contracts/change-envelope"
import type { EntityName } from "@/lib/contracts/entities"
import type { DomainRecords } from "@/lib/db/types"
import { decodeRecord } from "./entity-registry"
import { isoToMs } from "./time"

export type DomainChange<TEntity extends EntityName = EntityName> = {
  [TKey in TEntity]: {
    entity: TKey
    op: "upsert" | "delete"
    id: string
    rev: number
    eventKey: string | null
    ts: number
    actorId?: string
    opId?: string
    /** present for upserts */
    record?: DomainRecords[TKey]
  }
}[TEntity]

export type ChangeDecodeResult =
  | { ok: true; change: DomainChange }
  | {
      ok: false
      reason: "header" | "missing_data" | "data"
      error?: z.ZodError
    }

export function decodeChangeEnvelope(raw: unknown): ChangeDecodeResult {
  const header = changeEnvelopeHeader.safeParse(raw)
  if (!header.success)
    return { ok: false, reason: "header", error: header.error }
  const h = header.data
  const base = {
    entity: h.entity,
    op: h.op,
    id: h.id,
    rev: h.rev,
    eventKey: h.eventKey,
    ts: isoToMs(h.ts),
    ...(h.actorId ? { actorId: h.actorId } : {}),
    ...(h.opId ? { opId: h.opId } : {}),
  }
  if (h.op === "delete") return { ok: true, change: base as DomainChange }
  if (h.data === undefined) return { ok: false, reason: "missing_data" }
  const record = decodeRecord(h.entity, h.data)
  if (!record.ok) return { ok: false, reason: "data", error: record.error }
  return { ok: true, change: { ...base, record: record.value } as DomainChange }
}
