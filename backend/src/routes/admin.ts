// Admin endpoints (REQUIREMENTS §3.3, §5.3, §5.6): users, sessions, settings, audit, tracked
// events and imports, maintenance mode, push diagnostics.
import type { FastifyInstance, FastifyRequest } from "fastify"
import { z } from "zod"
import type { Ctx } from "../app.js"
import type { Principal } from "../auth/guard.js"
import { eventKey as eventKeySchema } from "../domain/contracts.js"
import { iso } from "../lib/clock.js"
import { generatePassphrase } from "../lib/passwords.js"
import { problem, zodErrors } from "../lib/problem.js"

const createUserBody = z.object({
  username: z.string().min(2).max(40),
  displayName: z.string().max(60).optional().default(""),
  role: z.enum(["admin", "scouter"]).default("scouter"),
})

const patchUserBody = z.object({
  role: z.enum(["admin", "scouter"]).optional(),
  active: z.boolean().optional(),
  scouterLevel: z.enum(["new", "experienced"]).optional(),
  displayName: z.string().min(1).max(60).optional(),
})

const trackBody = z.object({
  eventKey: eventKeySchema,
  live: z.boolean().optional().default(true),
  /** a manual event (no TBA data) */
  name: z.string().min(1).max(120).optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  timezone: z.string().min(1).max(60).optional(),
})

export async function adminRoutes(api: FastifyInstance, ctx: Ctx) {
  const { s } = ctx

  const admin = async (req: FastifyRequest): Promise<Principal> => {
    const p = await ctx.auth(req)
    if (p.role !== "admin") throw problem(403, "role_required")
    return p
  }
  const parse = <T extends z.ZodType>(schema: T, body: unknown): z.infer<T> => {
    const r = schema.safeParse(body ?? {})
    if (!r.success) throw problem(422, "validation_failed", { errors: zodErrors(r.error.issues) })
    return r.data
  }
  const opId = (req: FastifyRequest) => req.headers["idempotency-key"] as string | undefined

  const endSessions = (userId: string, kind: "sessionRevoked") => {
    s.sessions.revokeUser(userId)
    s.users.invalidateTokens(userId)
    s.bus.emit("inbox", { userId, payload: { v: 1, kind, ts: iso(s.clock.now()) } })
    s.bus.emit("dropPushDevices", { userId })
  }

  api.get("/admin/users", async (req) => {
    await admin(req)
    return {
      items: s.users.all().map((u) => s.users.record(u.id) ?? { id: u.id, rev: 1, updatedAt: iso(u.updated_at), username: u.username, displayName: u.display_name, role: u.role, active: u.active === 1 }),
    }
  })

  api.post("/admin/users", async (req, reply) => {
    const p = await admin(req)
    return ctx.idem(req, reply, p, async () => {
      const body = parse(createUserBody, req.body)
      const created = await s.users.create(body, p.id, opId(req))
      s.settings.userSettings(String(created.user.id))
      return { status: 201, body: created }
    })
  })

  api.patch<{ Params: { id: string } }>("/admin/users/:id", async (req, reply) => {
    const p = await admin(req)
    return ctx.idem(req, reply, p, () => {
      const body = parse(patchUserBody, req.body)
      const { user, roleChanged, deactivated } = s.users.update(req.params.id, body, p.id, opId(req))
      if (body.scouterLevel) s.settings.setScouterLevel(req.params.id, body.scouterLevel, p.id, opId(req))
      if (roleChanged) {
        s.bus.emit("inbox", { userId: req.params.id, payload: { v: 1, kind: "roleChanged", role: body.role, ts: iso(s.clock.now()) } })
        // the old role's token stops working; the app refreshes and reconnects with the new one
        s.users.invalidateTokens(req.params.id)
      }
      if (deactivated) endSessions(req.params.id, "sessionRevoked")
      return { status: 200, body: user }
    })
  })

  api.post<{ Params: { id: string } }>("/admin/users/:id/revoke-sessions", async (req, reply) => {
    const p = await admin(req)
    return ctx.idem(req, reply, p, () => {
      if (!s.users.byId(req.params.id)) throw problem(404, "not_found", { current: null })
      endSessions(req.params.id, "sessionRevoked")
      return { status: 204, body: null }
    })
  })

  /** A fresh passphrase for a user who forgot theirs (shown once, like on creation). */
  api.post<{ Params: { id: string } }>("/admin/users/:id/reset-password", async (req, reply) => {
    const p = await admin(req)
    return ctx.idem(req, reply, p, async () => {
      if (!s.users.byId(req.params.id)) throw problem(404, "not_found", { current: null })
      const passphrase = generatePassphrase()
      await s.users.setPassword(req.params.id, passphrase)
      endSessions(req.params.id, "sessionRevoked")
      return { status: 200, body: { passphrase } }
    })
  })

  api.get<{ Params: { ek: string }; Querystring: { before?: string; limit?: string } }>("/events/:ek/admin/audit", async (req) => {
    await admin(req)
    const before = req.query.before ? Date.parse(req.query.before) : Number.MAX_SAFE_INTEGER
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 500)
    const rows = s.db.all<{ id: string; event_key: string; at: number; actor_id: string; action: string; entity: string; record_id: string; reason: string | null }>(
      "SELECT * FROM audit WHERE event_key = ? AND at < ? ORDER BY at DESC LIMIT ?",
      req.params.ek,
      Number.isFinite(before) ? before : Number.MAX_SAFE_INTEGER,
      limit
    )
    return {
      items: rows.map((r) => ({ id: r.id, eventKey: r.event_key, at: iso(r.at), actorId: r.actor_id, action: r.action, entity: r.entity, recordId: r.record_id, reason: r.reason })),
    }
  })

  api.put("/team-settings", async (req, reply) => {
    const p = await ctx.auth(req)
    return ctx.idem(req, reply, p, () => ({ status: 200, body: s.settings.putTeamSettings(req.body, p, opId(req)) }))
  })

  api.put<{ Params: { ek: string } }>("/events/:ek/settings", async (req, reply) => {
    const p = await ctx.auth(req)
    return ctx.idem(req, reply, p, () => ({ status: 200, body: s.settings.putEventSettings(req.params.ek, req.body, p, opId(req)) }))
  })

  // ---- tracked events (imports) ----------------------------------------------------------------

  const eventView = (ek: string, live: boolean) => ({
    eventKey: ek,
    live,
    event: s.store.live("event", ek) ?? null,
    imports: Object.fromEntries(
      [...s.importer.health].filter(([k]) => k.startsWith(`${ek}:`)).map(([k, v]) => [k.slice(ek.length + 1), { ok: v.ok, at: iso(v.at), ...(v.message ? { message: v.message } : {}) }])
    ),
    nexusDataAsOf: s.importer.nexusDataAsOf(ek) ? iso(s.importer.nexusDataAsOf(ek) as number) : null,
  })

  api.get("/admin/events", async (req) => {
    await admin(req)
    return {
      items: s.importer.trackedEvents().map((e) => eventView(e.eventKey, e.live)),
      sources: { tba: !!s.importer.tba, nexus: !!s.importer.nexus, statbotics: s.config.STATBOTICS_ENABLED },
    }
  })

  api.post("/admin/events", async (req, reply) => {
    const p = await admin(req)
    return ctx.idem(req, reply, p, async () => {
      const body = parse(trackBody, req.body)
      if (body.name) {
        if (!body.startDate || !body.endDate)
          throw problem(422, "validation_failed", { errors: [{ path: "startDate", code: "required", message: "Manual events need dates" }] })
        s.importer.createManualEvent({ eventKey: body.eventKey, name: body.name, startDate: body.startDate, endDate: body.endDate, timezone: body.timezone })
      }
      s.importer.track(body.eventKey, body.live)
      const result = await s.importer.full(body.eventKey)
      if (!s.store.live("event", body.eventKey)) {
        s.importer.untrack(body.eventKey)
        throw problem(422, "validation_failed", {
          detail: s.importer.tba ? "The Blue Alliance doesn't know this event" : "No TBA key configured: create a manual event with a name and dates",
          errors: [{ path: "eventKey", code: "unknown_event" }],
        })
      }
      return { status: 201, body: { ...eventView(body.eventKey, body.live), changed: result } }
    })
  })

  api.patch<{ Params: { ek: string } }>("/admin/events/:ek", async (req, reply) => {
    const p = await admin(req)
    return ctx.idem(req, reply, p, () => {
      const body = parse(z.object({ live: z.boolean() }), req.body)
      if (!s.importer.trackedEvents().some((e) => e.eventKey === req.params.ek)) throw problem(404, "not_found", { current: null })
      s.importer.track(req.params.ek, body.live)
      return { status: 200, body: eventView(req.params.ek, body.live) }
    })
  })

  /** Stops importing; the event's data stays (past events remain browsable). */
  api.delete<{ Params: { ek: string } }>("/admin/events/:ek", async (req, reply) => {
    const p = await admin(req)
    return ctx.idem(req, reply, p, () => {
      s.importer.untrack(req.params.ek)
      return { status: 204, body: null }
    })
  })

  api.post<{ Params: { ek: string } }>("/admin/events/:ek/import", async (req, reply) => {
    const p = await admin(req)
    return ctx.idem(req, reply, p, async () => {
      if (!s.importer.trackedEvents().some((e) => e.eventKey === req.params.ek)) throw problem(404, "not_found", { current: null })
      const changed = await s.importer.full(req.params.ek)
      return { status: 200, body: { ...eventView(req.params.ek, true), changed } }
    })
  })

  /** Admin "force resync": every client re-pulls these entities from the change log. */
  api.post<{ Params: { ek: string } }>("/events/:ek/control/resync", async (req, reply) => {
    const p = await admin(req)
    return ctx.idem(req, reply, p, () => {
      const body = (req.body ?? {}) as { entities?: unknown; reason?: unknown }
      const entities = Array.isArray(body.entities) ? body.entities.map(String) : ["match", "eventTeam", "scoutEntry", "pitScouting", "postScouting", "comment", "message", "picklist", "picklistEntry", "eventSettings", "allianceBoard"]
      s.bus.emit("control", {
        eventKey: req.params.ek,
        payload: { v: 1, cmd: "resync", entities, reason: typeof body.reason === "string" ? body.reason : "admin", ts: iso(s.clock.now()) },
      })
      return { status: 202, body: { entities } }
    })
  })

  api.put("/admin/maintenance", async (req, reply) => {
    const p = await admin(req)
    return ctx.idem(req, reply, p, () => {
      const body = parse(z.object({ maintenance: z.boolean(), message: z.string().max(300).nullable().optional() }), req.body)
      s.db.setMeta("maintenance", body.maintenance ? "1" : "0")
      if (body.message) s.db.setMeta("maintenance_message", body.message)
      else s.db.run("DELETE FROM meta WHERE key = 'maintenance_message'")
      s.publisher.publishStatus()
      return { status: 200, body: s.sysStatus() }
    })
  })

  api.get("/admin/push/stats", async (req) => {
    await admin(req)
    return s.push.statsView()
  })
}
