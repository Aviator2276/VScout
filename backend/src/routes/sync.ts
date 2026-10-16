// Reads: /sync/changes (HTTP and RPC), the SSE stream, and the optional batch push.
import type { FastifyInstance } from "fastify"
import type { Ctx } from "../app.js"
import { API_PREFIX } from "../app.js"
import { SYNC_SCOPE_RE, parseCursorsParam } from "../domain/sync.js"
import { iso } from "../lib/clock.js"
import { isPlainObject } from "../lib/json.js"
import { problem } from "../lib/problem.js"

export const RPC_PAGE_BYTES = 512 * 1024

export async function syncRoutes(api: FastifyInstance, ctx: Ctx) {
  const { s } = ctx

  const checkScope = (scope: string, p: { role: string; eventKey?: string }) => {
    if (!SYNC_SCOPE_RE.test(scope))
      throw problem(400, "validation_failed", { errors: [{ path: "scope", code: "invalid", message: "global, user or event:<eventKey>" }] })
    if (p.role === "guest" && scope.startsWith("event:") && scope.slice(6) !== p.eventKey) throw problem(403, "guest_access_disabled")
  }

  api.get<{ Querystring: Record<string, string | undefined> }>("/sync/changes", async (req, reply) => {
    const p = await ctx.auth(req)
    const q = req.query
    const scope = String(q.scope ?? "")
    checkScope(scope, p)
    const entities = String(q.entities ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean)
    const rawLimit = Number(q.limit ?? 500)
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 500, 1), 2000)
    const page = s.sync.changes(
      { id: p.id, role: p.role },
      {
        scope,
        entities,
        cursors: parseCursorsParam(q.cursors),
        limit,
        ...(req.viaRpc ? { maxBytes: RPC_PAGE_BYTES } : {}),
      }
    )
    reply.header("Cache-Control", "no-store")
    return { ...page, serverTime: iso(s.clock.now()) }
  })

  api.get<{ Querystring: { scopes?: string; access_token?: string } }>("/sync/stream", async (req, reply) => {
    const token = req.query.access_token ?? /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1]
    if (!token) throw problem(401, "token_invalid")
    const p = await s.guard.fromToken(token)
    const scopes = String(req.query.scopes ?? "global,user")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
    for (const sc of scopes) checkScope(sc, p)
    const claims = await s.tokens.verify(token)
    reply.hijack()
    // CORS headers for EventSource requests (the cors plugin's headers are on the reply we bypass)
    const origin = req.headers.origin
    if (origin && s.config.PWA_ORIGIN.includes(origin)) {
      reply.raw.setHeader("Access-Control-Allow-Origin", origin)
      reply.raw.setHeader("Access-Control-Allow-Credentials", "true")
      reply.raw.setHeader("Vary", "Origin")
    }
    s.sse.open(reply.raw, { id: p.id, role: p.role }, scopes, claims.exp * 1000)
  })

  /** Batch push (REQUIREMENTS §7.4): each op runs through the normal route with its own key. */
  api.post("/sync/push", async (req) => {
    await ctx.auth(req)
    const body = req.body
    if (!isPlainObject(body) || !Array.isArray(body.ops))
      throw problem(400, "validation_failed", { errors: [{ path: "ops", code: "required" }] })
    if (body.ops.length > 100) throw problem(413, "payload_too_large", { detail: "At most 100 ops per batch" })
    const results: Array<{ opId: string; status: number; body: unknown }> = []
    for (const raw of body.ops as unknown[]) {
      const op = isPlainObject(raw) ? raw : {}
      const opId = typeof op.opId === "string" ? op.opId : ""
      const method = String(op.method ?? "").toUpperCase()
      const path = typeof op.path === "string" ? op.path : ""
      if (!opId || !["POST", "PUT", "PATCH", "DELETE"].includes(method) || !path.startsWith("/") || path.startsWith("/sync/push") || path.startsWith("/auth/")) {
        results.push({ opId, status: 400, body: problem(400, "validation_failed", { detail: "Invalid op" }).body(req.id) })
        continue
      }
      let url = `${API_PREFIX}${path}`
      let payload: unknown = op.body
      if (op.baseRev !== undefined) {
        if (method === "DELETE" && !/[?&]baseRev=/.test(path)) url += `${path.includes("?") ? "&" : "?"}baseRev=${encodeURIComponent(String(op.baseRev))}`
        else if (isPlainObject(payload) && payload.baseRev === undefined) payload = { ...payload, baseRev: op.baseRev }
      }
      const res = await req.server.inject({
        method: method as "POST",
        url,
        headers: {
          authorization: req.headers.authorization ?? "",
          "idempotency-key": opId,
          "x-client-version": String(req.headers["x-client-version"] ?? ""),
          "content-type": "application/json",
          ...(req.viaRpc ? { "x-vscout-rpc": ctx.rpcSecret } : {}),
        },
        ...(payload !== undefined ? { payload: JSON.stringify(payload) } : {}),
      })
      results.push({ opId, status: res.statusCode, body: res.body ? safeJson(res.body) : null })
    }
    return { results }
  })
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}
