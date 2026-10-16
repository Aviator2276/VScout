// /auth/* (HTTP-only) and the caller's own account: /me, /me/password, /me/settings.
import type { FastifyInstance, FastifyReply } from "fastify"
import { z } from "zod"
import type { Ctx } from "../app.js"
import { iso } from "../lib/clock.js"
import { verifyPassword } from "../lib/passwords.js"
import { problem, zodErrors } from "../lib/problem.js"
import { PERMISSIONS } from "./meta.js"

export const REFRESH_COOKIE = "vscout_refresh"

export async function authRoutes(api: FastifyInstance, ctx: Ctx) {
  const { s } = ctx

  const setCookie = (reply: FastifyReply, token: string, expiresAt: number) =>
    reply.setCookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: s.config.COOKIE_SECURE,
      sameSite: "strict",
      path: "/api/v1/auth",
      expires: new Date(expiresAt),
    })

  const clearCookie = (reply: FastifyReply) =>
    reply.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth", httpOnly: true, secure: s.config.COOKIE_SECURE, sameSite: "strict" })

  api.post("/auth/login", async (req, reply) => {
    const r = await s.auth.login(req.body, ctx.ip(req))
    setCookie(reply, r.refresh.token, r.refresh.expiresAt)
    reply.header("Cache-Control", "no-store")
    return r.body
  })

  api.post("/auth/guest", async (req, reply) => {
    const r = await s.auth.guest(req.body, ctx.ip(req))
    setCookie(reply, r.refresh.token, r.refresh.expiresAt)
    reply.header("Cache-Control", "no-store")
    return r.body
  })

  api.post("/auth/refresh", async (req, reply) => {
    try {
      const r = await s.auth.refresh(req.cookies[REFRESH_COOKIE])
      setCookie(reply, r.refresh.token, r.refresh.expiresAt)
      reply.header("Cache-Control", "no-store")
      return r.body
    } catch (e) {
      clearCookie(reply)
      throw e
    }
  })

  api.post("/auth/logout", async (req, reply) => {
    const p = await ctx.auth(req)
    const body = (req.body ?? {}) as { deviceId?: unknown }
    const deviceId = typeof body.deviceId === "string" ? body.deviceId : p.deviceId || undefined
    s.auth.logout(p.id, deviceId, req.cookies[REFRESH_COOKIE])
    s.sessions.revokeFamily(p.sid)
    clearCookie(reply)
    return reply.status(204).send()
  })

  api.get("/me", async (req) => {
    const p = await ctx.auth(req)
    const family = s.sessions.family(p.sid)
    const teamNumber = s.settings.teamNumber()
    let user: Record<string, unknown>
    if (p.role === "guest") user = { id: p.id, username: null, displayName: "Guest", role: "guest", teamNumber }
    else {
      const u = s.users.byId(p.id)
      if (!u) throw problem(401, "token_invalid")
      user = { id: u.id, username: u.username, displayName: u.display_name, role: u.role, teamNumber }
    }
    return {
      user,
      permissions: PERMISSIONS[p.role],
      serverTime: iso(s.clock.now()),
      refreshExpiresAt: iso(family?.expires_at ?? s.clock.now()),
      ...(p.eventKey ? { eventKey: p.eventKey } : {}),
    }
  })

  const passwordBody = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) })
  api.post("/me/password", async (req, reply) => {
    const p = await ctx.auth(req)
    if (p.role === "guest") throw problem(403, "role_required")
    const run = async () => {
      const parsed = passwordBody.safeParse(req.body)
      if (!parsed.success) throw problem(422, "validation_failed", { errors: zodErrors(parsed.error.issues) })
      const u = s.users.byId(p.id)
      if (!u) throw problem(401, "token_invalid")
      s.auth.loginLimiter.consume(`pw:${p.id}`)
      // 422, not 401: a 401 on a signed-in call means "refresh the token" to the app
      if (!(await verifyPassword(parsed.data.currentPassword, u.password_hash))) throw problem(422, "invalid_credentials")
      await s.users.setPassword(p.id, parsed.data.newPassword)
      s.auth.loginLimiter.reset(`pw:${p.id}`)
      return { status: 204, body: null }
    }
    if (req.headers["idempotency-key"]) return ctx.idem(req, reply, p, run)
    return ctx.send(reply, await run())
  })

  api.get("/me/settings", async (req) => {
    const p = await ctx.auth(req)
    if (p.role === "guest") throw problem(403, "role_required")
    return s.settings.userSettings(p.id)
  })

  api.patch("/me/settings", async (req, reply) => {
    const p = await ctx.auth(req)
    if (p.role === "guest") throw problem(403, "role_required")
    return ctx.idem(req, reply, p, () => ({
      status: 200,
      body: s.settings.patchUserSettings(p.id, req.body, p.id, req.headers["idempotency-key"] as string),
    }))
  })
}
