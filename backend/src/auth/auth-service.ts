// Login, guest login, refresh and logout (REQUIREMENTS §3.3–3.4).
import { z } from "zod"
import type { Clock } from "../lib/clock.js"
import { iso } from "../lib/clock.js"
import { uuidv7 } from "../lib/ids.js"
import { burnPasswordCheck, verifyPassword } from "../lib/passwords.js"
import { problem, zodErrors } from "../lib/problem.js"
import { RateLimiter } from "../lib/rate-limit.js"
import type { Db } from "../db/db.js"
import type { Bus } from "../domain/bus.js"
import type { Settings } from "../domain/settings.js"
import type { Users } from "../domain/users.js"
import { aclFor } from "./acl.js"
import type { FamilyRow, IssuedRefresh, Sessions } from "./sessions.js"
import type { TokenService } from "./tokens.js"

const deviceId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "letters, digits, - and _")

export const loginRequest = z.object({
  username: z.string().min(1).max(80),
  password: z.string().min(1).max(500),
  deviceId,
  deviceName: z.string().max(80).optional().default(""),
})

export const guestLoginRequest = z.object({
  code: z.string().min(1).max(20),
  deviceId,
  deviceName: z.string().max(80).optional().default(""),
})

export interface SessionResult {
  body: Record<string, unknown>
  refresh: IssuedRefresh
}

export class AuthService {
  /** per account (10 / 10 min) — the main brute-force guard */
  readonly loginLimiter: RateLimiter
  /** per IP, generous: a whole team shares one venue NAT address */
  readonly loginIpLimiter: RateLimiter
  /** wrong guest codes per device (5 / 10 min, REQUIREMENTS §3.4) */
  readonly guestLimiter: RateLimiter
  readonly guestIpLimiter: RateLimiter

  constructor(
    private db: Db,
    private clock: Clock,
    private users: Users,
    private sessions: Sessions,
    private tokens: TokenService,
    private settings: Settings,
    private bus: Bus,
    private log: (msg: string, data?: Record<string, unknown>) => void = () => {}
  ) {
    this.loginLimiter = new RateLimiter(clock, 10, 10 * 60_000)
    this.loginIpLimiter = new RateLimiter(clock, 60, 10 * 60_000)
    this.guestLimiter = new RateLimiter(clock, 5, 10 * 60_000)
    this.guestIpLimiter = new RateLimiter(clock, 20, 10 * 60_000)
  }

  private async sessionBody(family: FamilyRow, refresh: IssuedRefresh, extra: Record<string, unknown> = {}): Promise<SessionResult> {
    const role = family.role as "admin" | "scouter" | "guest"
    const cid = `vscout-${family.user_id}-${family.device_id}`
    const ek = family.guest_event_key ?? undefined
    const { token, expiresAt } = await this.tokens.sign({
      sub: family.user_id,
      role,
      cid,
      sid: family.id,
      ...(ek ? { ek } : {}),
      acl: aclFor(family.user_id, role, ek),
    })
    const teamNumber = this.settings.teamNumber()
    let user: Record<string, unknown>
    if (role === "guest") {
      user = { id: family.user_id, username: null, displayName: "Guest", role, teamNumber }
    } else {
      const u = this.users.byId(family.user_id)
      if (!u) throw problem(401, "refresh_invalid")
      user = { id: u.id, username: u.username, displayName: u.display_name, role: u.role, teamNumber }
    }
    return {
      body: {
        accessToken: token,
        accessExpiresAt: iso(expiresAt),
        refreshExpiresAt: iso(refresh.expiresAt),
        user,
        ...(ek ? { eventKey: ek } : {}),
        ...extra,
      },
      refresh,
    }
  }

  async login(body: unknown, ip: string): Promise<SessionResult> {
    const parsed = loginRequest.safeParse(body)
    if (!parsed.success) throw problem(422, "validation_failed", { errors: zodErrors(parsed.error.issues) })
    const { username, password, deviceId: dev, deviceName } = parsed.data
    const userKey = `user:${username.toLowerCase()}`
    this.loginLimiter.check(userKey)
    this.loginIpLimiter.check(`ip:${ip}`)
    const u = this.users.byUsername(username)
    const ok = u ? await verifyPassword(password, u.password_hash) : (await burnPasswordCheck(password), false)
    if (!u || !ok || u.active !== 1) {
      this.loginLimiter.hit(userKey)
      this.loginIpLimiter.hit(`ip:${ip}`)
      throw problem(401, "invalid_credentials")
    }
    this.loginLimiter.reset(userKey)
    const refresh = this.sessions.start({ userId: u.id, deviceId: dev, deviceName, role: u.role })
    return this.sessionBody(refresh.family, refresh)
  }

  async guest(body: unknown, ip: string): Promise<SessionResult> {
    const parsed = guestLoginRequest.safeParse(body)
    // a malformed code is just a wrong code (no hints about the format)
    const dev = parsed.success ? parsed.data.deviceId : "invalid"
    this.guestLimiter.check(`dev:${dev}`)
    this.guestIpLimiter.check(`ip:${ip}`)
    const eventKey = parsed.success ? this.settings.eventForGuestCode(parsed.data.code) : null
    if (!parsed.success || !eventKey) {
      this.guestLimiter.hit(`dev:${dev}`)
      this.guestIpLimiter.hit(`ip:${ip}`)
      throw problem(401, "invalid_guest_code")
    }
    const now = this.clock.now()
    const existing = this.db.get<{ id: string }>("SELECT id FROM guests WHERE device_id = ?", dev)
    const guestId = existing?.id ?? `guest-${uuidv7(now)}`
    this.db.run(
      `INSERT INTO guests (id, device_id, event_key, device_name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET event_key = excluded.event_key, device_name = excluded.device_name, last_login_at = excluded.last_login_at`,
      guestId,
      dev,
      eventKey,
      parsed.data.deviceName,
      now,
      now
    )
    const refresh = this.sessions.start({ userId: guestId, deviceId: dev, deviceName: parsed.data.deviceName, role: "guest", guestEventKey: eventKey })
    // guest logins are logged: anyone with the code can read the event (REQUIREMENTS §12)
    this.log("guest login", { eventKey, guestId, deviceId: dev, ip })
    return this.sessionBody(refresh.family, refresh)
  }

  async refresh(cookieToken: string | undefined): Promise<SessionResult> {
    const refresh = this.sessions.rotate(cookieToken)
    const f = refresh.family
    if (f.role === "guest") {
      if (!f.guest_event_key || !this.settings.guestAccessEnabled(f.guest_event_key)) {
        this.sessions.revokeFamily(f.id)
        throw problem(401, "refresh_invalid")
      }
    } else {
      const u = this.users.byId(f.user_id)
      if (!u || u.active !== 1) throw problem(401, "refresh_invalid")
      // role changes apply at the next refresh
      if (u.role !== f.role) {
        this.db.run("UPDATE refresh_families SET role = ? WHERE id = ?", u.role, f.id)
        f.role = u.role
      }
    }
    return this.sessionBody(f, refresh, { deviceId: f.device_id })
  }

  /** Ends this device's session: the family of the cookie, or the caller's family for deviceId. */
  logout(userId: string, deviceIdArg: string | undefined, cookieToken: string | undefined) {
    const fam = this.sessions.familyForToken(cookieToken)
    if (fam && fam.user_id === userId) this.sessions.revokeFamily(fam.id)
    if (deviceIdArg) {
      const fams = this.db.all<FamilyRow>(
        "SELECT * FROM refresh_families WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL",
        userId,
        deviceIdArg
      )
      for (const f of fams) this.sessions.revokeFamily(f.id)
    }
    const devices = [deviceIdArg ?? fam?.device_id].filter((d): d is string => !!d)
    this.bus.emit("dropPushDevices", { userId, deviceIds: devices })
  }

  async serviceToken(username: string, clientId: string): Promise<string> {
    const { token } = await this.tokens.sign(
      { sub: username, role: "service", cid: clientId, sid: "service", acl: aclFor(username, "service") },
      30 * 86_400
    )
    return token
  }
}
