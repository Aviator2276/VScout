// Refresh-token families, one per device (REQUIREMENTS §3.2, §14a): rotation on every refresh with
// a 60-second grace window that replays the same new token, sliding expiry, guest sessions.
import type { Db } from "../db/db.js"
import type { Clock } from "../lib/clock.js"
import { uuidv7, randomToken } from "../lib/ids.js"
import { sha256 } from "../lib/json.js"
import { problem } from "../lib/problem.js"

export const REFRESH_GRACE_MS = 60_000

export interface FamilyRow {
  id: string
  user_id: string
  device_id: string
  device_name: string | null
  role: string
  guest_event_key: string | null
  created_at: number
  expires_at: number
  revoked_at: number | null
}

interface TokenRow {
  token_hash: string
  family_id: string
  created_at: number
  rotated_at: number | null
  next_token: string | null
  next_expires_at: number | null
}

export interface IssuedRefresh {
  token: string
  family: FamilyRow
  expiresAt: number
}

export class Sessions {
  constructor(
    private db: Db,
    private clock: Clock,
    private ttlMs: number
  ) {}

  family(id: string): FamilyRow | undefined {
    return this.db.get<FamilyRow>("SELECT * FROM refresh_families WHERE id = ?", id)
  }

  isLive(familyId: string): boolean {
    const f = this.family(familyId)
    return !!f && f.revoked_at === null && f.expires_at > this.clock.now()
  }

  /** A new family for this device. Any earlier session on the same device ends (one per device). */
  start(input: { userId: string; deviceId: string; deviceName?: string | null; role: string; guestEventKey?: string | null }): IssuedRefresh {
    return this.db.tx(() => {
      const now = this.clock.now()
      this.db.run(
        "UPDATE refresh_families SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL",
        now,
        input.deviceId
      )
      const family: FamilyRow = {
        id: uuidv7(now),
        user_id: input.userId,
        device_id: input.deviceId,
        device_name: input.deviceName ?? null,
        role: input.role,
        guest_event_key: input.guestEventKey ?? null,
        created_at: now,
        expires_at: now + this.ttlMs,
        revoked_at: null,
      }
      this.db.run(
        `INSERT INTO refresh_families (id, user_id, device_id, device_name, role, guest_event_key, created_at, expires_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        family.id,
        family.user_id,
        family.device_id,
        family.device_name,
        family.role,
        family.guest_event_key,
        family.created_at,
        family.expires_at
      )
      const token = this.newToken(family.id, now)
      return { token, family, expiresAt: family.expires_at }
    })
  }

  private newToken(familyId: string, now: number): string {
    const token = `${familyId}.${randomToken(32)}`
    this.db.run(
      "INSERT INTO refresh_tokens (token_hash, family_id, created_at) VALUES (?, ?, ?)",
      sha256(token),
      familyId,
      now
    )
    return token
  }

  /**
   * Rotates a refresh token. Replaying a rotated token within the grace window returns the same
   * new token; replaying it later means it leaked, so the whole family is revoked.
   */
  rotate(token: string | undefined): IssuedRefresh {
    if (!token) throw problem(401, "refresh_invalid")
    let stolenFamily: string | null = null
    const issued = this.db.tx((): IssuedRefresh | null => {
      const now = this.clock.now()
      const row = this.db.get<TokenRow>("SELECT * FROM refresh_tokens WHERE token_hash = ?", sha256(token))
      if (!row) throw problem(401, "refresh_invalid")
      const family = this.family(row.family_id)
      if (!family || family.revoked_at !== null || family.expires_at <= now) throw problem(401, "refresh_invalid")
      if (row.rotated_at !== null) {
        if (now - row.rotated_at <= REFRESH_GRACE_MS && row.next_token) {
          // follow the chain in case the replacement was itself rotated meanwhile
          let latest = row
          for (let i = 0; i < 20 && latest.next_token; i++) {
            const n = this.db.get<TokenRow>("SELECT * FROM refresh_tokens WHERE token_hash = ?", sha256(latest.next_token))
            if (!n || n.rotated_at === null || !n.next_token) break
            latest = n
          }
          return {
            token: latest.next_token ?? row.next_token,
            family,
            expiresAt: latest.next_expires_at ?? family.expires_at,
          }
        }
        // replayed after the grace window: the token leaked, end the whole family (outside the tx)
        stolenFamily = family.id
        return null
      }
      const next = this.newToken(family.id, now)
      const expiresAt = now + this.ttlMs
      this.db.run("UPDATE refresh_families SET expires_at = ? WHERE id = ?", expiresAt, family.id)
      this.db.run(
        "UPDATE refresh_tokens SET rotated_at = ?, next_token = ?, next_expires_at = ? WHERE token_hash = ?",
        now,
        next,
        expiresAt,
        row.token_hash
      )
      return { token: next, family: { ...family, expires_at: expiresAt }, expiresAt }
    })
    if (stolenFamily) this.revokeFamily(stolenFamily)
    if (!issued) throw problem(401, "refresh_invalid")
    return issued
  }

  /** The family a refresh cookie belongs to, without rotating it. */
  familyForToken(token: string | undefined): FamilyRow | undefined {
    if (!token) return undefined
    const row = this.db.get<TokenRow>("SELECT * FROM refresh_tokens WHERE token_hash = ?", sha256(token))
    return row ? this.family(row.family_id) : undefined
  }

  revokeFamily(id: string) {
    this.db.run(
      "UPDATE refresh_families SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
      this.clock.now(),
      id
    )
  }

  /** Revokes every live family of a user; returns their device ids. */
  revokeUser(userId: string): string[] {
    const fams = this.db.all<FamilyRow>(
      "SELECT * FROM refresh_families WHERE user_id = ? AND revoked_at IS NULL",
      userId
    )
    for (const f of fams) this.revokeFamily(f.id)
    return fams.map((f) => f.device_id)
  }

  /** Revokes every guest family of an event; returns the guest user ids and devices. */
  revokeGuests(eventKey: string): Array<{ userId: string; deviceId: string }> {
    const fams = this.db.all<FamilyRow>(
      "SELECT * FROM refresh_families WHERE guest_event_key = ? AND revoked_at IS NULL",
      eventKey
    )
    for (const f of fams) this.revokeFamily(f.id)
    return fams.map((f) => ({ userId: f.user_id, deviceId: f.device_id }))
  }

  liveGuestCount(eventKey?: string): number {
    const now = this.clock.now()
    return (
      (eventKey
        ? this.db.get<{ n: number }>(
            "SELECT COUNT(*) AS n FROM refresh_families WHERE guest_event_key = ? AND revoked_at IS NULL AND expires_at > ?",
            eventKey,
            now
          )
        : this.db.get<{ n: number }>(
            "SELECT COUNT(*) AS n FROM refresh_families WHERE role = 'guest' AND revoked_at IS NULL AND expires_at > ?",
            now
          )
      )?.n ?? 0
    )
  }

  /** Daily cleanup: expired/revoked families older than a week, and spent grace tokens. */
  prune(): Array<{ userId: string; deviceId: string }> {
    const now = this.clock.now()
    const ended = this.db.all<FamilyRow>(
      "SELECT * FROM refresh_families WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR expires_at < ?",
      now - 7 * 86_400_000,
      now
    )
    this.db.run(
      "UPDATE refresh_tokens SET next_token = NULL WHERE rotated_at IS NOT NULL AND rotated_at < ?",
      now - REFRESH_GRACE_MS
    )
    this.db.run(
      "DELETE FROM refresh_families WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR expires_at < ?",
      now - 7 * 86_400_000,
      now - 7 * 86_400_000
    )
    return ended.map((f) => ({ userId: f.user_id, deviceId: f.device_id }))
  }
}
