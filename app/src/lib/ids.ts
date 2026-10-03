// Injectable ids. Client-created records use UUIDv7 (ADR-007): sortable by creation time.
import { v7 as uuidv7 } from "uuid"

export interface IdGen {
  newId: () => string
}

export const uuidIds: IdGen = { newId: () => uuidv7() }

/** Creation time (epoch ms) encoded in a UUIDv7, or null for anything else (data-layer §9.2.1). */
export function uuidv7Time(id: string): number | null {
  const m =
    /^([0-9a-f]{8})-([0-9a-f]{4})-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.exec(
      id
    )
  if (!m) return null
  return parseInt(`${m[1]}${m[2]}`, 16)
}
