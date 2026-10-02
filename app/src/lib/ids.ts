// Injectable ids. Client-created records use UUIDv7 (ADR-007): sortable by creation time.
import { v7 as uuidv7 } from "uuid"

export interface IdGen {
  newId: () => string
}

export const uuidIds: IdGen = { newId: () => uuidv7() }
