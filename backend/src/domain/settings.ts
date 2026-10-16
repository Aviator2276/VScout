// Singletons: eventSettings (admin, per event), teamSettings (admin, global), userSettings (one JSON
// document per user). REQUIREMENTS §5.3, §5.4, §5.6, §3.4.
import { iso } from "../lib/clock.js"
import { isPlainObject } from "../lib/json.js"
import { problem, zodErrors } from "../lib/problem.js"
import type { Sessions } from "../auth/sessions.js"
import type { Bus } from "./bus.js"
import { eventSettingsRecord, teamNumber } from "./contracts.js"
import type { Rec } from "./entities.js"
import { newBoard, rankedTeams } from "./board.js"
import type { Store } from "./store.js"
import type { Actor } from "./writes.js"

const USER_SERVER_KEYS = ["id", "rev", "updatedAt", "userId"]

export class Settings {
  constructor(
    private store: Store,
    private sessions: Sessions,
    private bus: Bus
  ) {}

  /** Creates the per-event singletons (rev 1) the first time an event is set up. */
  ensureEventSingletons(eventKey: string): void {
    this.store.tx(() => {
      const now = this.store.now()
      if (!this.store.get("eventSettings", eventKey))
        this.store.put(
          "eventSettings",
          {
            id: eventKey,
            eventKey,
            rev: 1,
            updatedAt: iso(now),
            scoutingOpen: true,
            followedPicklistId: null,
            guestAccess: { enabled: false, code: null, rotatedAt: null },
          },
          { source: "system" }
        )
      if (!this.store.get("allianceBoard", eventKey))
        this.store.put("allianceBoard", newBoard(eventKey, rankedTeams(this.store, eventKey), now), { source: "system" })
    })
  }

  ensureTeamSettings(): void {
    this.store.tx(() => {
      if (!this.store.get("teamSettings", "team"))
        this.store.put("teamSettings", { id: "team", rev: 1, updatedAt: iso(this.store.now()), teamNumber: null }, { source: "system" })
    })
  }

  teamNumber(): number | null {
    const n = this.store.live("teamSettings", "team")?.teamNumber
    return typeof n === "number" ? n : null
  }

  putTeamSettings(body: unknown, actor: Actor, opId?: string): Rec {
    if (actor.role !== "admin") throw problem(403, "role_required")
    if (!isPlainObject(body) || !isPlainObject(body.record))
      throw problem(400, "validation_failed", { errors: [{ path: "record", code: "required" }] })
    const raw = body.record.teamNumber ?? null
    const parsed = teamNumber.nullable().safeParse(raw)
    if (!parsed.success) throw problem(422, "validation_failed", { errors: zodErrors(parsed.error.issues, "record.teamNumber") })
    const record = body.record
    const baseRev = Number(body.baseRev)
    this.ensureTeamSettings()
    return this.store.tx(() => {
      const current = this.store.live("teamSettings", "team") as Rec
      if (baseRev !== current.rev) throw problem(409, "rev_conflict", { current })
      const next: Rec = {
        ...current,
        ...record,
        id: "team",
        teamNumber: parsed.data,
        rev: current.rev + 1,
        updatedAt: iso(this.store.now()),
      }
      this.store.put("teamSettings", next, { actorId: actor.id, opId })
      return next
    })
  }

  /** The event whose enabled guest access uses this code (case-insensitive). */
  eventForGuestCode(code: string): string | null {
    const wanted = code.trim().toUpperCase()
    for (const s of this.store.listLive("eventSettings")) {
      const g = s.guestAccess as { enabled?: boolean; code?: string | null } | undefined
      if (g?.enabled && g.code && g.code.toUpperCase() === wanted) return String(s.eventKey)
    }
    return null
  }

  guestAccessEnabled(eventKey: string): boolean {
    const g = this.store.live("eventSettings", eventKey)?.guestAccess as { enabled?: boolean } | undefined
    return g?.enabled === true
  }

  putEventSettings(eventKey: string, body: unknown, actor: Actor, opId?: string): Rec {
    if (actor.role !== "admin") throw problem(403, "role_required")
    if (!isPlainObject(body) || !isPlainObject(body.record))
      throw problem(400, "validation_failed", { errors: [{ path: "record", code: "required" }] })
    const parsed = eventSettingsRecord.safeParse(body.record)
    if (!parsed.success) throw problem(422, "validation_failed", { errors: zodErrors(parsed.error.issues, "record") })
    if (!this.store.live("event", eventKey)) throw problem(404, "not_found", { current: null })
    this.ensureEventSingletons(eventKey)

    let revoke: "guest_access_disabled" | "guest_code_rotated" | null = null
    const rec = this.store.tx(() => {
      const current = this.store.live("eventSettings", eventKey) as Rec
      if (Number(body.baseRev) !== current.rev) throw problem(409, "rev_conflict", { current })
      const patch: Record<string, unknown> = { ...parsed.data }
      for (const k of ["id", "eventKey", "rev", "updatedAt"]) delete patch[k]
      const old = (current.guestAccess as { enabled: boolean; code: string | null; rotatedAt: string | null } | undefined) ?? {
        enabled: false,
        code: null,
        rotatedAt: null,
      }
      if (parsed.data.guestAccess) {
        const g = parsed.data.guestAccess
        const code = g.code === undefined ? old.code : g.code
        if (g.enabled && !code)
          throw problem(422, "validation_failed", { errors: [{ path: "record.guestAccess.code", code: "required" }] })
        if (g.enabled && code) {
          const other = this.eventForGuestCode(code)
          if (other && other !== eventKey) throw problem(409, "guest_code_taken", { current })
        }
        const rotated = code !== old.code
        patch.guestAccess = {
          enabled: g.enabled,
          code: code ?? null,
          rotatedAt: rotated ? iso(this.store.now()) : old.rotatedAt,
        }
        if (old.enabled && !g.enabled) revoke = "guest_access_disabled"
        else if (old.enabled && rotated) revoke = "guest_code_rotated"
      }
      const next: Rec = {
        ...current,
        ...patch,
        id: eventKey,
        eventKey,
        rev: current.rev + 1,
        updatedAt: iso(this.store.now()),
      }
      this.store.put("eventSettings", next, { actorId: actor.id, opId })
      if (revoke) {
        const reason = revoke
        const guests = this.sessions.revokeGuests(eventKey)
        this.store.db.afterCommit(() => {
          for (const g of guests) {
            this.bus.emit("inbox", { userId: g.userId, payload: { v: 1, kind: "forceLogout", reason, ts: iso(this.store.now()) } })
            this.bus.emit("dropPushDevices", { userId: g.userId, deviceIds: [g.deviceId] })
          }
        })
      }
      return next
    })
    return rec
  }

  /** The caller's settings document, created at rev 1 on first access (never a partial record). */
  userSettings(userId: string): Rec {
    const existing = this.store.live("userSettings", userId)
    if (existing) return existing
    return this.store.tx(() => {
      const again = this.store.live("userSettings", userId)
      if (again) return again
      const rec: Rec = { id: userId, userId, rev: 1, updatedAt: iso(this.store.now()), v: 1 }
      this.store.put("userSettings", rec, { source: "system" })
      return rec
    })
  }

  /** JSON merge patch of top-level keys; unknown keys are stored and returned unchanged. */
  patchUserSettings(userId: string, body: unknown, actorId: string, opId?: string): Rec {
    if (!isPlainObject(body) || !isPlainObject(body.patch))
      throw problem(400, "validation_failed", { errors: [{ path: "patch", code: "required" }] })
    const baseRev = Number(body.baseRev)
    if (!Number.isInteger(baseRev)) throw problem(400, "validation_failed", { errors: [{ path: "baseRev", code: "required" }] })
    const patch = body.patch
    if (JSON.stringify(patch).length > 256 * 1024) throw problem(413, "payload_too_large")
    const current = this.userSettings(userId)
    return this.store.tx(() => {
      const cur = this.store.live("userSettings", userId) ?? current
      if (baseRev !== cur.rev) throw problem(409, "rev_conflict", { current: cur })
      const next: Rec = { ...cur }
      for (const [k, v] of Object.entries(patch)) {
        if (USER_SERVER_KEYS.includes(k)) continue
        if (v === null) delete next[k]
        else next[k] = v
      }
      next.rev = cur.rev + 1
      next.updatedAt = iso(this.store.now())
      this.store.put("userSettings", next, { actorId, opId })
      return next
    })
  }

  /** Admin-set scouter level goes into that user's settings document (REQUIREMENTS §3.3). */
  setScouterLevel(userId: string, level: "new" | "experienced", actorId: string, opId?: string) {
    const cur = this.userSettings(userId)
    if (cur.scouterLevel === level) return
    this.patchUserSettings(userId, { baseRev: cur.rev, patch: { scouterLevel: level } }, actorId, opId)
  }
}
