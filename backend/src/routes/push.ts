// Web Push endpoints (REQUIREMENTS §10.2).
import type { FastifyInstance } from "fastify"
import type { Ctx } from "../app.js"
import { RateLimiter } from "../lib/rate-limit.js"
import { problem } from "../lib/problem.js"

export async function pushRoutes(api: FastifyInstance, ctx: Ctx) {
  const { s } = ctx
  const rotateLimiter = new RateLimiter(s.clock, 10, 60_000)
  const testLimiter = new RateLimiter(s.clock, 5, 60_000)

  api.get("/push/vapid-public-key", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=3600")
    return { publicKey: s.vapidPublicKey }
  })

  api.put<{ Params: { deviceId: string } }>("/push/subscriptions/:deviceId", async (req) => {
    const p = await ctx.auth(req)
    // idempotent by nature (an upsert), so no Idempotency-Key is required here
    return s.push.upsert(p.id, req.params.deviceId, req.body)
  })

  api.delete<{ Params: { deviceId: string } }>("/push/subscriptions/:deviceId", async (req, reply) => {
    const p = await ctx.auth(req)
    s.push.remove(p.id, req.params.deviceId)
    return reply.status(204).send()
  })

  api.post("/push/subscriptions/rotate", async (req, reply) => {
    rotateLimiter.consume(`ip:${ctx.ip(req)}`)
    s.push.rotate(req.body)
    return reply.status(204).send()
  })

  api.post("/push/test", async (req, reply) => {
    const p = await ctx.auth(req)
    testLimiter.consume(`user:${p.id}`)
    if (!s.push.enabled) throw problem(503, "push_unavailable", { detail: "Push is not configured on this server" })
    const r = await s.push.test(p.id)
    return reply.status(202).send(r)
  })
}
