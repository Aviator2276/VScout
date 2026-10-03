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

export interface MockSession {
  userId: string
  role: "admin" | "scouter" | "guest"
  /** guests aren't accounts: their user record travels with the session */
  user?: Record<string, unknown>
}

/** The dev server's saved state (FX-61): Maps as entry lists. */
export interface MockSnapshot {
  v: 1
  log: Array<LogEntry>
  sessions: Array<[string, MockSession]>
  records: Array<[string, MockRecord]>
  tombstones: Array<[string, number]>
  trash: Array<[string, MockRecord]>
  audit: Array<Record<string, unknown>>
  accounts: Array<[string, MockAccount]>
  users: Array<[string, MockRecord]>
  takenGuestCodes: Array<string>
  idempotency: Array<[string, StoredResponse]>
  pushSubscriptions: Array<[string, Record<string, unknown>]>
  demoEvents: Array<[string, Array<MadeRecord>]>
  applied: number
  tick: number
  lastNow: number
}

/** a record a demo event created (AD7a), so Delete can remove it */
export interface MadeRecord {
  scope: string
  entity: EntityName
  id: string
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
  /** dev server: live listeners for new change-log entries (SSE) */
  appendListeners: new Set<(entry: LogEntry) => void>(),
  /** dev server: the server clock is the real time (tests keep the fixed 2026-03-20 clock) */
  realClock: false,
  lastNow: 0,
  sessions: new Map<string, MockSession>(),
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
  /** demo events (AD7a): eventKey → what each one made */
  demoEvents: new Map<string, Array<MadeRecord>>(),
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
    this.realClock = false
    this.lastNow = 0
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
    this.demoEvents = new Map()
    this.loseNextResponse = false
    this.applied = 0
    this.tick = 0
  },

  /** Dev server (FX-61): everything worth keeping across restarts, as plain JSON. */
  snapshot(): MockSnapshot {
    return {
      v: 1,
      log: this.log,
      sessions: [...this.sessions],
      records: [...this.records],
      tombstones: [...this.tombstones],
      trash: [...this.trash],
      audit: this.audit,
      accounts: [...this.accounts],
      users: [...this.users],
      takenGuestCodes: [...this.takenGuestCodes],
      idempotency: [...this.idempotency],
      pushSubscriptions: [...this.pushSubscriptions],
      demoEvents: [...this.demoEvents],
      applied: this.applied,
      tick: this.tick,
      lastNow: this.lastNow,
    }
  },

  /** Dev server (FX-61): back to a saved snapshot; false if it isn't one. */
  restore(raw: unknown): boolean {
    const s = raw as Partial<MockSnapshot> | null
    if (s?.v !== 1 || !Array.isArray(s.log)) return false
    this.log = s.log
    this.sessions = new Map(s.sessions ?? [])
    this.records = new Map(s.records ?? [])
    this.tombstones = new Map(s.tombstones ?? [])
    this.trash = new Map(s.trash ?? [])
    this.audit = s.audit ?? []
    this.accounts = new Map(s.accounts ?? [])
    this.users = new Map(s.users ?? [])
    this.takenGuestCodes = new Set(s.takenGuestCodes ?? [])
    this.idempotency = new Map(s.idempotency ?? [])
    this.pushSubscriptions = new Map(s.pushSubscriptions ?? [])
    this.demoEvents = new Map(s.demoEvents ?? [])
    this.applied = s.applied ?? 0
    this.tick = s.tick ?? 0
    this.lastNow = s.lastNow ?? 0
    return true
  },

  append(
    scope: SyncScope,
    entity: EntityName,
    envelope: Record<string, unknown>
  ) {
    const entry = { scope, entity, envelope }
    this.log.push(entry)
    // the dev server's SSE change stream (GET /sync/stream) pushes it out at once
    for (const listener of this.appendListeners) listener(entry)
  },

  /** strictly increasing server time */
  now(): string {
    this.tick++
    if (this.realClock) {
      // dev server: real time (owner: messages all said 12:00 and announcements "197 days ago"),
      // still strictly increasing for same-millisecond writes
      this.lastNow = Math.max(Date.now(), this.lastNow + 1)
      return new Date(this.lastNow).toISOString()
    }
    return new Date(Date.UTC(2026, 2, 20, 16, 0, 0, this.tick)).toISOString()
  },

  /** an ISO time `minutes` from now on the server clock (sessions, /meta) */
  at(minutes = 0): string {
    const base = this.realClock ? Date.now() : Date.UTC(2026, 2, 20, 15, 0, 0)
    return new Date(base + minutes * 60_000).toISOString()
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
