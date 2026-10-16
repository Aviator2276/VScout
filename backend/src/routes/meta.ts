// GET /meta (no auth), the permission map, JWKS for the broker, health.
import type { FastifyInstance } from "fastify"
import type { Ctx } from "../app.js"
import { iso } from "../lib/clock.js"

/** Role → actions (REQUIREMENTS §4), so a CI test can detect drift between server and app. */
export const PERMISSIONS: Record<"admin" | "scouter" | "guest", string[]> = {
  admin: [
    "event.read",
    "chat.read",
    "dm.read",
    "scouting.write",
    "comment.write",
    "picklist.write",
    "picklist.master",
    "message.write",
    "reaction.write",
    "presence.publish",
    "board.record",
    "board.admin",
    "records.moderate",
    "eventSettings.write",
    "teamSettings.write",
    "announcement.write",
    "users.manage",
    "userSettings.write",
  ],
  scouter: [
    "event.read",
    "chat.read",
    "dm.read",
    "scouting.write",
    "comment.write",
    "picklist.write",
    "message.write",
    "reaction.write",
    "presence.publish",
    "board.record",
    "userSettings.write",
  ],
  guest: ["event.read", "reaction.announcement"],
}

export async function metaRoutes(api: FastifyInstance, { s }: Ctx) {
  api.get("/meta", async () => ({
    apiVersion: 1,
    minClientVersion: s.config.MIN_CLIENT_VERSION,
    serverTime: iso(s.clock.now()),
    activeGameId: s.config.ACTIVE_GAME_ID,
    gameSchemaVersions: s.config.GAME_SCHEMA_VERSIONS,
    capabilities: s.capabilities(),
  }))

  api.get("/meta/permissions", async () => ({ roles: PERMISSIONS }))

  api.get("/.well-known/jwks.json", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=300")
    return s.tokens.jwks()
  })

  api.get("/healthz", async (_req, reply) => {
    let db = true
    try {
      s.db.get("SELECT 1")
    } catch {
      db = false
    }
    const imports = Object.fromEntries(
      [...s.importer.health].map(([k, v]) => [k, { ok: v.ok, at: iso(v.at), ...(v.message ? { message: v.message } : {}) }])
    )
    reply.status(db ? 200 : 503)
    return {
      ok: db,
      serverTime: iso(s.clock.now()),
      mqtt: { configured: !!s.config.MQTT_URL, publishFailures: s.publisher.failures, published: s.publisher.published },
      push: s.push.statsView(),
      changeLogHead: s.store.head(),
      sseClients: s.sse.size,
      imports,
    }
  })
}
