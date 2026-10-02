// The session (routing-auth §5, §7): login, guest login, cache-reset recovery, refresh, expiry
// warnings and logout with a full wipe. Guards read the cached Dexie session (no network), so
// navigation works offline. React reads it with useSyncExternalStore (hooks/use-session.ts).
import { takeResetDeviceId } from "@/lib/pwa/clear-cache"
import { decodeMe, decodeSession } from "@/lib/api/adapters/session-adapter"
import type { DecodedSession } from "@/lib/api/adapters/session-adapter"
import type { ApiClient } from "@/lib/api/api-client"
import { ApiError, OfflineError } from "@/lib/api/errors"
import type { Clock } from "@/lib/clock"
import { getKv, setKv } from "@/lib/db/kv"
import type { VScoutDB } from "@/lib/db/schema"
import type { SessionRow } from "@/lib/db/types"
import type { IdGen } from "@/lib/ids"
import { logger } from "@/lib/logger"
import type { BroadcastLike, createRefresher } from "./refresh"
import type { TokenStore } from "./token-store"
import type { Session } from "./types"

export type LoginErrorCode =
  | "invalid_credentials"
  | "invalid_guest_code"
  | "rate_limited"
  | "offline"
  | "unknown"

export class LoginError extends Error {
  readonly code: LoginErrorCode
  constructor(code: LoginErrorCode) {
    super(code)
    this.name = "LoginError"
    this.code = code
  }
}

export type ExpiryState = "ok" | "warn" | "urgent" | "expired"
const HOUR = 60 * 60 * 1000

/** Banner 48 h before the refresh cookie expires, blocking prompt under 24 h (ADR-035). */
export function expiryState(session: Session | null, now: number): ExpiryState {
  if (!session) return "ok"
  const left = session.refreshExpiresAt - now
  if (left <= 0) return "expired"
  if (left < 24 * HOUR) return "urgent"
  if (left < 48 * HOUR) return "warn"
  return "ok"
}

export interface AuthDeps {
  /** the database is recreated empty after a logout wipe */
  db: () => VScoutDB
  api: ApiClient
  tokens: TokenStore
  refresher: ReturnType<typeof createRefresher>
  clock: Clock
  ids: IdGen
  deviceName: () => string
  isOnline?: () => boolean
  channel?: BroadcastLike
  /** stop sync, end MQTT, unsubscribe push, clear caches (wired by the app) */
  onLoggedOut?: (reason: string) => void | Promise<void>
  onRoleChanged?: (role: Session["role"]) => void
}

export type LogoutResult = { ok: true } | { ok: false; pendingChanges: number }

function toSession(row: SessionRow | undefined): Session | null {
  if (!row) return null
  return {
    userId: row.userId,
    displayName: row.displayName,
    role: row.role,
    refreshExpiresAt: row.refreshExpiresAt,
    status: row.status,
    eventKey: row.eventKey,
  }
}

export function createAuthClient(deps: AuthDeps) {
  let cached: Session | null | undefined // undefined = not loaded yet
  let loading: Promise<Session | null> | null = null
  const listeners = new Set<() => void>()
  const isOnline = deps.isOnline ?? (() => true)

  const emit = () => {
    for (const l of listeners) l()
  }
  const setCached = (s: Session | null) => {
    cached = s
    emit()
  }

  async function deviceId(): Promise<string> {
    const db = deps.db()
    const existing = await getKv(db, "deviceId")
    if (existing) return existing
    const id = takeResetDeviceId() ?? deps.ids.newId()
    await setKv(db, "deviceId", id)
    return id
  }

  async function writeSession(
    s: DecodedSession,
    status: Session["status"] = "active"
  ): Promise<Session> {
    const db = deps.db()
    const previous = toSession(await db.session.get("current"))
    const row: SessionRow = {
      id: "current",
      userId: s.user.id,
      username: s.user.username,
      displayName: s.user.displayName,
      role: s.user.role,
      eventKey: s.eventKey,
      refreshExpiresAt: s.refreshExpiresAt,
      status,
      lastVerifiedAt: deps.clock.now(),
    }
    await db.session.put(row)
    // the backend may re-bind this device (PV-3); otherwise keep ours
    if (s.deviceId) await setKv(db, "deviceId", s.deviceId)
    deps.tokens.set(s.accessToken, s.accessExpiresAt)
    const session = toSession(row) as Session
    if (
      previous &&
      previous.userId === session.userId &&
      previous.role !== session.role
    )
      deps.onRoleChanged?.(session.role)
    setCached(session)
    return session
  }

  /** Logging in as someone else on a shared device starts from an empty database. */
  async function wipeIfOtherUser(userId: string): Promise<void> {
    const current = await deps.db().session.get("current")
    if (current && current.userId !== userId) await wipe("switch-user")
  }

  /** set while the database is being deleted and recreated */
  let wiping: Promise<void> | null = null

  /** Runs `work` as the one sign-out in progress; sign-ins wait for it (afterWipe). */
  async function exclusive<TResult>(
    work: () => Promise<TResult>
  ): Promise<TResult> {
    const run = work()
    const done = run.then(
      () => undefined,
      () => undefined
    )
    wiping = done
    try {
      return await run
    } finally {
      if (wiping === done) wiping = null
    }
  }

  async function wipe(reason: string): Promise<void> {
    deps.tokens.clear()
    setCached(null)
    await deps.onLoggedOut?.(reason)
    const db = deps.db()
    await db.delete()
    await db.open()
  }

  /**
   * The login screen shows before the wipe finishes (it's where logout navigates); a quick
   * Sign In must wait for the database to be back instead of failing on a closed one.
   */
  async function afterWipe(): Promise<void> {
    if (wiping) await wiping
  }

  function loginError(error: unknown): LoginError {
    if (error instanceof OfflineError) return new LoginError("offline")
    if (error instanceof ApiError) {
      const code = error.problem.code
      if (
        code === "invalid_credentials" ||
        code === "invalid_guest_code" ||
        code === "rate_limited"
      )
        return new LoginError(code)
    }
    return new LoginError("unknown")
  }

  async function signIn(
    path: "/auth/login" | "/auth/guest",
    body: Record<string, unknown>
  ): Promise<Session> {
    await afterWipe()
    let decoded: DecodedSession
    try {
      const res = await deps.api.request({
        method: "POST",
        path,
        class: "auth",
        anonymous: true,
        body: {
          ...body,
          deviceId: await deviceId(),
          deviceName: deps.deviceName(),
        },
      })
      const d = decodeSession(res.body)
      if (!d.ok) throw new LoginError("unknown")
      decoded = d.value
    } catch (error) {
      if (error instanceof LoginError) throw error
      throw loginError(error)
    }
    await wipeIfOtherUser(decoded.user.id)
    const session = await writeSession(decoded)
    deps.channel?.postMessage({ type: "session" })
    return session
  }

  async function load(): Promise<Session | null> {
    // no afterWipe here: logout's own navigation to /login runs this while the wipe waits for it
    const row = await deps.db().session.get("current")
    if (row) return toSession(row)
    if (!isOnline()) return null
    // cache-reset recovery (mqtt.md §8.1): the HttpOnly cookie can outlive IndexedDB
    const refreshed = await deps.refresher.refresh()
    if (refreshed.kind !== "ok" || !refreshed.session) return null
    try {
      const me = await deps.api.request({
        method: "GET",
        path: "/me",
        class: "delta",
      })
      const decodedMe = decodeMe(me.body)
      if (!decodedMe.ok) return null
      return await writeSession({
        ...refreshed.session,
        user: decodedMe.value.user,
        refreshExpiresAt: decodedMe.value.refreshExpiresAt,
      })
    } catch (error) {
      logger.warn("auth", "session recovery failed", { error: String(error) })
      return null
    }
  }

  /** this user's writes that haven't reached the server */
  async function pendingChanges(): Promise<number> {
    const s = cached
    if (!s) return 0
    return deps.db().outbox.where("userId").equals(s.userId).count()
  }

  async function refresh(): Promise<boolean> {
    const outcome = await deps.refresher.refresh()
    const db = deps.db()
    const current = await db.session.get("current")
    switch (outcome.kind) {
      case "ok":
        if (outcome.session && current) {
          if (outcome.session.user.id !== current.userId) {
            await wipe("cookie-user-mismatch")
            return false
          }
          await writeSession(outcome.session)
        } else if (current?.status === "needs-reauth") {
          await db.session.update("current", { status: "active" })
          setCached({ ...(toSession(current) as Session), status: "active" })
        }
        return true
      case "offline":
        return false
      case "rejected":
        if (current) {
          await db.session.update("current", { status: "needs-reauth" })
          setCached({
            ...(toSession(current) as Session),
            status: "needs-reauth",
          })
        }
        return false
      case "disabled":
        await wipe("account_disabled")
        return false
    }
  }

  return {
    deviceId,
    /** Guards call this: one Dexie read per page load, no network when a session row exists. */
    ensureLoaded(): Promise<Session | null> {
      if (cached !== undefined) return Promise.resolve(cached)
      loading ??= load().then((s) => {
        loading = null
        setCached(s)
        return s
      })
      return loading
    },
    getSession: (): Session | null => cached ?? null,
    getAccessToken: () => deps.tokens.get(),
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    login: (username: string, password: string) =>
      signIn("/auth/login", { username, password }),
    loginAsGuest: (code: string) => signIn("/auth/guest", { code }),
    refresh,
    /** before connecting MQTT or syncing: refresh when the token is missing or about to expire */
    async refreshIfNeeded(): Promise<boolean> {
      if (!isOnline()) return false
      const token = deps.tokens.get()
      if (token && deps.tokens.expiresAt() - deps.clock.now() > 60_000)
        return true
      return refresh()
    },
    expiry: () => expiryState(cached ?? null, deps.clock.now()),
    pendingChanges,
    /** Asks first when unsynced changes exist, unless forced (routing-auth §7.5). */
    async logout(
      opts: { force?: boolean; reason?: string } = {}
    ): Promise<LogoutResult> {
      return exclusive(async (): Promise<LogoutResult> => {
        const pending = await pendingChanges()
        if (pending > 0 && !opts.force)
          return { ok: false, pendingChanges: pending }
        const db = deps.db()
        const id = await getKv(db, "deviceId")
        try {
          if (isOnline() && id)
            await deps.api.request({
              method: "POST",
              path: "/auth/logout",
              class: "auth",
              body: { deviceId: id },
            })
        } catch (error) {
          logger.info("auth", "logout call failed; wiping anyway", {
            error: String(error),
          })
        }
        await wipe(opts.reason ?? "logout")
        deps.channel?.postMessage({
          type: "logout",
          reason: opts.reason ?? "logout",
        })
        return { ok: true }
      })
    },
    /** Another tab logged out or signed in: drop the cache so guards re-read. */
    invalidate() {
      cached = undefined
      emit()
    },
  }
}

export type AuthClient = ReturnType<typeof createAuthClient>
