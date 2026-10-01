// One adapter per entity: `normalize` fixes backend drift on the raw JSON before validation
// (renamed or moved fields), `toDomain` maps the validated wire record to the Dexie shape.
// A backend change touches only lib/contracts and this folder (ADR-071).
import type { EntityName, WireRecord } from "@/lib/contracts/entities"
import type { DomainRecords, OwnedMeta } from "@/lib/db/types"
import { isoToMs } from "./time"

export interface EntityAdapter<TEntity extends EntityName> {
  /** Raw wire JSON → the shape lib/contracts expects. Identity unless the backend drifted. */
  normalize?: (raw: Record<string, unknown>) => Record<string, unknown>
  toDomain: (wire: WireRecord<TEntity>) => DomainRecords[TEntity]
}

export function serverMeta(wire: {
  id: string
  rev: number
  updatedAt: string
}) {
  return { id: wire.id, rev: wire.rev, updatedAt: isoToMs(wire.updatedAt) }
}

/** Owned records from the server are always `synced`. */
export function ownedMeta(wire: {
  id: string
  rev: number
  updatedAt: string
  createdAt: string
  eventKey: string
  authorId: string
  updatedBy?: string
}): OwnedMeta {
  const updatedAt = isoToMs(wire.updatedAt)
  return {
    id: wire.id,
    rev: wire.rev,
    updatedAt,
    createdAt: isoToMs(wire.createdAt),
    eventKey: wire.eventKey,
    authorId: wire.authorId,
    ...(wire.updatedBy ? { updatedBy: wire.updatedBy } : {}),
    syncState: "synced",
    localUpdatedAt: updatedAt,
  }
}

/** Drops the wire meta keys from a record so the rest can be spread into the domain shape. */
export function withoutOwnedMeta<T extends Record<string, unknown>>(wire: T) {
  const {
    id: _id,
    rev: _rev,
    updatedAt: _u,
    createdAt: _c,
    eventKey: _e,
    authorId: _a,
    updatedBy: _b,
    ...rest
  } = wire
  return rest
}
