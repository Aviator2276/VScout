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

/** A sign-in account. `role: null` follows `mockBackend.role` (tests set that directly). */
export interface MockAccount {
  id: string
  username: string
  displayName: string
  password: string
  role: "admin" | "scouter" | null
}
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
  /** dev server: refresh succeeds only after a login (a stand-in for the HttpOnly cookie) */
  requireSignIn: false,
  signedIn: false,
  /** the signed-in caller (tokens aren't checked; the role is) */
  role: "scouter" as "admin" | "scouter" | "guest",
  userId: MOCK_USER_ID,
  /**
   * Dev server only (`pnpm mock:api`): each device signs in on its own, like the real backend's
   * HttpOnly refresh cookie. Sign-in creates a session; refresh reads the device's cookie; every
   * request acts as the user its access token belongs to. Tests keep the single global caller.
   */
  perDeviceSessions: false,
  sessions: new Map<
    string,
    {
      userId: string
      role: "admin" | "scouter" | "guest"
      /** guests aren't accounts: their user record travels with the session */
      user?: Record<string, unknown>
    }
  >(),
  /** tokens that answer 401 token_expired */
  expiredTokens: new Set<string>(),
  records: new Map<string, MockRecord>(),
  tombstones: new Map<string, number>(),
  /** deleted records, for restore (ADR-029) */
  trash: new Map<string, MockRecord>(),
  /** moderation history (GET /events/{ek}/admin/audit) */
  audit: [] as Array<Record<string, unknown>>,
  /** who can sign in (POST /auth/login), by username */
  accounts: new Map<string, MockAccount>(),
  /** admin-managed accounts (GET/POST/PATCH /admin/users) */
  users: new Map<string, MockRecord>(),
  /** guest codes in use by other events (409 guest_code_taken) */
  takenGuestCodes: new Set<string>(),
  idempotency: new Map<string, StoredResponse>(),
  /** apply the next write, then drop its response (simulates a timeout after the server committed) */
  loseNextResponse: false,
  /** push subscriptions by deviceId (push-contract §2.2) */
  pushSubscriptions: new Map<string, Record<string, unknown>>(),
  /** how many writes were actually applied (not replayed) */
  applied: 0,
  tick: 0,

  reset() {
    this.log = []
    this.refreshValid = true
    this.requireSignIn = false
    this.signedIn = false
    this.role = "scouter"
    this.userId = MOCK_USER_ID
    this.perDeviceSessions = false
    this.sessions = new Map()
    this.expiredTokens = new Set()
    this.records = new Map()
    this.tombstones = new Map()
    this.trash = new Map()
    this.audit = []
    this.accounts = new Map([
      [
        MOCK_CREDENTIALS.username,
        {
          id: MOCK_USER_ID,
          username: "alex",
          displayName: "Alex",
          password: MOCK_CREDENTIALS.password,
          role: null,
        },
      ],
    ])
    this.users = new Map([
      [
        MOCK_USER_ID,
        {
          id: MOCK_USER_ID,
          rev: 1,
          updatedAt: "2026-03-20T15:00:00.000Z",
          username: "alex",
          displayName: "Alex",
          role: "admin",
          active: true,
        },
      ],
    ])
    this.takenGuestCodes = new Set()
    this.idempotency = new Map()
    this.pushSubscriptions = new Map()
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

  /** the signed-in account's user, as sessions and /me report it */
  sessionUser() {
    const account = [...this.accounts.values()].find(
      (a) => a.id === this.userId
    )
    return {
      id: this.userId,
      username: account?.username ?? "alex",
      displayName: account?.displayName ?? "Alex",
      role: this.role === "guest" ? ("scouter" as const) : this.role,
      teamNumber: 2276,
    }
  },

  key(entity: string, id: string) {
    return `${entity}:${id}`
  },
}
