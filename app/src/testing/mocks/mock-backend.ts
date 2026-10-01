// In-memory backend state behind the MSW handlers (tests, `pnpm mock:api`, the docker stack).
// Phase 1 track 5 (sync) adds writes, idempotency and conflicts on top of this change log.
import type { EntityName } from "@/lib/contracts/entities"
import type { SyncScope } from "@/lib/contracts/sync-changes"

export interface LogEntry {
  scope: SyncScope
  entity: EntityName
  envelope: Record<string, unknown>
}

export const MOCK_CREDENTIALS = {
  username: "alex",
  password: "correct horse 42",
}
export const MOCK_GUEST_CODE = "K7M2QX"

export const mockBackend = {
  /** the change log; a cursor is the index after the last returned entry */
  log: [] as Array<LogEntry>,
  refreshValid: true,
  reset() {
    this.log = []
    this.refreshValid = true
  },
  append(
    scope: SyncScope,
    entity: EntityName,
    envelope: Record<string, unknown>
  ) {
    this.log.push({ scope, entity, envelope })
  },
}
