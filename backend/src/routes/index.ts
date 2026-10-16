import type { FastifyInstance } from "fastify"
import type { Ctx } from "../app.js"
import { HTTP_ONLY } from "../app.js"
import { problem } from "../lib/problem.js"
import { adminRoutes } from "./admin.js"
import { authRoutes } from "./auth.js"
import { mediaRoutes } from "./media.js"
import { metaRoutes } from "./meta.js"
import { pushRoutes } from "./push.js"
import { recordRoutes } from "./records.js"
import { syncRoutes } from "./sync.js"

export async function registerRoutes(api: FastifyInstance, ctx: Ctx) {
  // the HTTP-only list (REQUIREMENTS §9.10) is refused over MQTT RPC
  api.addHook("onRequest", async (req) => {
    if (req.viaRpc && HTTP_ONLY.some((re) => re.test(ctx.apiPath(req))))
      throw problem(404, "not_found", { detail: "This endpoint is HTTP-only" })
  })
  await metaRoutes(api, ctx)
  await authRoutes(api, ctx)
  await adminRoutes(api, ctx)
  await syncRoutes(api, ctx)
  await pushRoutes(api, ctx)
  await mediaRoutes(api, ctx)
  await recordRoutes(api, ctx)
}
