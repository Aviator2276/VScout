// Domain records for Dexie seeding: a wire factory's output through the app's own adapter, so a
// seeded row is exactly what sync would have written.
import { decodeRecord } from "@/lib/api/adapters/entity-registry"
import type { EntityName, WireRecord } from "@/lib/contracts/entities"
import type { DomainRecords } from "@/lib/db/types"

export function toDomain<TEntity extends EntityName>(
  entity: TEntity,
  wire: WireRecord<TEntity>
): DomainRecords[TEntity] {
  const r = decodeRecord(entity, wire)
  if (!r.ok) throw r.error
  return r.value
}
