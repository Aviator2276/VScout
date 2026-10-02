// In-memory backend behind the MSW handlers (tests, `pnpm mock:api`, the docker stack). It follows
// the HTTP contract's write rules (http-api-contract §4): client ids, Idempotency-Key replay,
// baseRev concurrency, natural-key duplicates, the author rule, guests, tombstones and restore.
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
export const MOCK_USER_ID = "01900000-0000-7000-8000-000000009000"

export type MockRecord = Record<string, unknown> & { id: string; rev: number }
interface StoredResponse {
  hash: string
  status: number
  body: unknown
}

export const mockBackend = {
  /** the change log; a cursor is the index after the last returned entry */
  log: [] as Array<LogEntry>,
  refreshValid: true,
  /** the signed-in caller (tokens aren't checked; the role is) */
  role: "scouter" as "admin" | "scouter" | "guest",
  userId: MOCK_USER_ID,
  /** tokens that answer 401 token_expired */
  expiredTokens: new Set<string>(),
  records: new Map<string, MockRecord>(),
  tombstones: new Map<string, number>(),
  idempotency: new Map<string, StoredResponse>(),
  /** apply the next write, then drop its response (simulates a timeout after the server committed) */
  loseNextResponse: false,
  /** how many writes were actually applied (not replayed) */
  applied: 0,
  tick: 0,

  reset() {
    this.log = []
    this.refreshValid = true
    this.role = "scouter"
    this.userId = MOCK_USER_ID
    this.expiredTokens = new Set()
    this.records = new Map()
    this.tombstones = new Map()
    this.idempotency = new Map()
    this.loseNextResponse = false
    this.applied = 0
    this.tick = 0
  },

  append(
    scope: SyncScope,
    entity: EntityName,
    envelope: Record<string, unknown>
  ) {
    this.log.push({ scope, entity, envelope })
  },

  /** strictly increasing server time */
  now(): string {
    this.tick++
    return new Date(Date.UTC(2026, 2, 20, 16, 0, 0, this.tick)).toISOString()
  },

  key(entity: string, id: string) {
    return `${entity}:${id}`
  },
}
