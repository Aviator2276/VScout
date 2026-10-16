// Record writes (REQUIREMENTS §7.3), the live alliance board (§7.5), chat history (§6.3) and the
// pit map (§6.3).
import type { FastifyInstance, FastifyRequest } from "fastify"
import type { Ctx } from "../app.js"
import type { Principal } from "../auth/guard.js"
import { boardActionRequest } from "../domain/contracts.js"
import { dmParticipants } from "../domain/routing.js"
import type { Actor } from "../domain/writes.js"
import { problem, zodErrors } from "../lib/problem.js"

const actorOf = (p: Principal): Actor => ({ id: p.id, role: p.role, eventKey: p.eventKey })

/** baseRev from the query, or an `If-Match: "<rev>"` header. */
function baseRevOf(req: FastifyRequest<{ Querystring: { baseRev?: string } }>): string | undefined {
  if (req.query.baseRev !== undefined) return req.query.baseRev
  const m = /^\s*(?:W\/)?"?(\d+)"?\s*$/.exec(String(req.headers["if-match"] ?? ""))
  return m?.[1]
}

export async function recordRoutes(api: FastifyInstance, ctx: Ctx) {
  const { s } = ctx
  const key = (req: FastifyRequest) => req.headers["idempotency-key"] as string | undefined

  api.post<{ Params: { ek: string } }>("/events/:ek/alliance-board/actions", async (req, reply) => {
    const p = await ctx.auth(req)
    if (!req.headers["idempotency-key"] && typeof (req.body as { id?: unknown })?.id === "string")
      req.headers["idempotency-key"] = (req.body as { id: string }).id
    return ctx.idem(req, reply, p, () => {
      if (p.role === "guest") throw problem(403, "role_required")
      const parsed = boardActionRequest.safeParse(req.body)
      if (!parsed.success) throw problem(422, "validation_failed", { errors: zodErrors(parsed.error.issues) })
      return { status: 200, body: s.board.apply(req.params.ek, parsed.data, actorOf(p), key(req)) }
    })
  })

  api.post<{ Params: { ek: string; collection: string } }>("/events/:ek/:collection", async (req, reply) => {
    const p = await ctx.auth(req)
    return ctx.idem(req, reply, p, () => ({
      status: 201,
      body: s.writes.create(req.params.collection, req.params.ek, req.body, actorOf(p), key(req)),
    }))
  })

  api.put<{ Params: { collection: string; id: string } }>("/:collection/:id", async (req, reply) => {
    const p = await ctx.auth(req)
    const ifMatch = /^\s*(?:W\/)?"?(\d+)"?\s*$/.exec(String(req.headers["if-match"] ?? ""))?.[1]
    const body = req.body as Record<string, unknown> | undefined
    const withRev = ifMatch && body && typeof body === "object" && body.baseRev === undefined ? { ...body, baseRev: Number(ifMatch) } : body
    return ctx.idem(req, reply, p, () => ({
      status: 200,
      body: s.writes.update(req.params.collection, req.params.id, withRev, actorOf(p), key(req)),
    }))
  })

  api.delete<{ Params: { collection: string; id: string }; Querystring: { baseRev?: string; reason?: string } }>(
    "/:collection/:id",
    async (req, reply) => {
      const p = await ctx.auth(req)
      return ctx.idem(req, reply, p, () => ({
        status: 200,
        body: s.writes.remove(req.params.collection, req.params.id, baseRevOf(req), actorOf(p), key(req), req.query.reason ?? null),
      }))
    }
  )

  api.post<{ Params: { collection: string; id: string } }>("/:collection/:id/restore", async (req, reply) => {
    const p = await ctx.auth(req)
    return ctx.idem(req, reply, p, () => ({
      status: 200,
      body: s.writes.restore(req.params.collection, req.params.id, req.body, actorOf(p), key(req)),
    }))
  })

  // ---- reads ---------------------------------------------------------------------------------

  api.get<{ Params: { channelId: string }; Querystring: { before?: string; limit?: string } }>(
    "/channels/:channelId/messages",
    async (req) => {
      const p = await ctx.auth(req)
      if (p.role === "guest") throw problem(403, "role_required")
      const channelId = decodeURIComponent(req.params.channelId)
      const dm = dmParticipants(channelId)
      if (dm && !dm.includes(p.id)) throw problem(403, "forbidden")
      if (!dm && !/^event:\d{4}[a-z0-9]+$/.test(channelId))
        throw problem(400, "validation_failed", { errors: [{ path: "channelId", code: "invalid" }] })
      const before = req.query.before ? Date.parse(req.query.before) : Number.NaN
      const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 200)
      const rows = s.db.all<{ data: string }>(
        `SELECT data FROM records WHERE entity = 'message' AND deleted = 0
           AND json_extract(data, '$.channelId') = ? AND created_at < ?
         ORDER BY created_at DESC LIMIT ?`,
        channelId,
        Number.isFinite(before) ? before : Number.MAX_SAFE_INTEGER,
        limit
      )
      return { items: rows.map((r) => JSON.parse(r.data) as unknown) }
    }
  )

  api.get<{ Params: { ek: string } }>("/events/:ek/pit-map", async (req, reply) => {
    const p = await ctx.auth(req)
    if (p.role === "guest" && p.eventKey !== req.params.ek) throw problem(403, "guest_access_disabled")
    const map = s.importer.pitMap(req.params.ek)
    if (!map) throw problem(404, "not_found", { detail: "No pit map for this event yet" })
    const etag = `"pm-${map.rev}-${map.hash.slice(0, 12)}"`
    reply.header("ETag", etag)
    reply.header("Cache-Control", "private, no-cache")
    if (req.headers["if-none-match"] === etag) return reply.status(304).send()
    return {
      rev: map.rev,
      imageUrl: `${s.config.PUBLIC_API_URL.replace(/\/+$/, "")}/api/v1/events/${req.params.ek}/pit-map.svg?v=${map.rev}`,
      width: map.width,
      height: map.height,
      pits: map.pits,
    }
  })

  /** The pit map image (no auth: `<img>` can't send a token, and a pit layout isn't private). */
  api.get<{ Params: { ek: string } }>("/events/:ek/pit-map.svg", async (req, reply) => {
    const map = s.importer.pitMap(req.params.ek)
    if (!map) throw problem(404, "not_found")
    reply.header("Cache-Control", "public, max-age=300")
    reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
    return reply.type("image/svg+xml").send(map.svg)
  })
}
