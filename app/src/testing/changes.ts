// Build decoded changes (what applyEnvelope receives) from wire factories.
import { decodeChangeEnvelope } from "@/lib/api/adapters/change-envelope-adapter"
import type { DomainChange } from "@/lib/api/adapters/change-envelope-adapter"
import type { EntityName, WireRecord } from "@/lib/contracts/entities"
import { wireEnvelope } from "./factories/wire"

export function change<TEntity extends EntityName>(
  entity: TEntity,
  record: WireRecord<TEntity>,
  o: Parameters<typeof wireEnvelope>[2] = {}
): DomainChange {
  const r = decodeChangeEnvelope(wireEnvelope(entity, record, o))
  if (!r.ok)
    throw new Error(
      `invalid test envelope: ${r.reason} ${r.error?.message ?? ""}`
    )
  return r.change
}
