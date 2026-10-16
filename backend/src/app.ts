// The HTTP API (REQUIREMENTS §2): /api/v1, JSON, problem+json errors, compression, CORS with
// credentials for the PWA origin, the version gate, request ids. MQTT RPC runs through this same
// app via inject(), so both transports share every handler.
import { randomBytes } from "node:crypto"
import Fastify from "fastify"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import cors from "@fastify/cors"
import compress from "@fastify/compress"
import cookie from "@fastify/cookie"
import multipart from "@fastify/multipart"
import type { Principal } from "./auth/guard.js"
import { requestHash } from "./domain/idempotency.js"
import type { StoredReply } from "./domain/idempotency.js"
import { uuidv7 } from "./lib/ids.js"
import { HttpProblem, problem } from "./lib/problem.js"
import { compareSemver, isValidSemver } from "./lib/semver.js"
import type { Services } from "./services.js"
import { registerRoutes } from "./routes/index.js"

export const API_PREFIX = "/api/v1"

declare module "fastify" {
  interface FastifyRequest {
    principalPromise?: Promise<Principal>
    viaRpc?: boolean
  }
}

export interface Ctx {
  s: Services
  /** marks requests the MQTT RPC adapter injected (never trusted from the network) */
  rpcSecret: string
  auth(req: FastifyRequest): Promise<Principal>
  /** Runs a write once per Idempotency-Key and sends the (stored) reply. */
  idem(req: FastifyRequest, reply: FastifyReply, p: Principal, fn: () => Promise<StoredReply> | StoredReply): Promise<FastifyReply>
  send(reply: FastifyReply, r: StoredReply): FastifyReply
  apiPath(req: FastifyRequest): string
  ip(req: FastifyRequest): string
}

/** Endpoints outside the version gate (REQUIREMENTS §2.2) and the HTTP-only list (§9.10). */
const UNGATED = [/^\/auth\//, /^\/meta(\/|$)/, /^\/media-files\//, /^\/\.well-known\//]
export const HTTP_ONLY = [/^\/auth\//, /^\/events\/[^/]+\/media$/, /^\/media-files\//, /^\/push\/subscriptions\/rotate$/, /^\/sync\/stream$/]

export async function buildApp(s: Services): Promise<{ app: FastifyInstance; ctx: Ctx }> {
  const config = s.config
  const app = Fastify({
    logger:
      config.LOG_LEVEL === "silent"
        ? false
        : {
            level: config.LOG_LEVEL,
            // never log query strings: /sync/stream carries the access token there
            serializers: {
              req: (req: { method: string; url: string; id: string }) => ({
                method: req.method,
                url: req.url.split("?")[0],
                requestId: req.id,
              }),
            },
          },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 2 * 1024 * 1024,
    genReqId: () => uuidv7(),
    requestIdHeader: false,
    return503OnClosing: true,
  })

  const rpcSecret = randomBytes(24).toString("hex")

  // an empty body is valid JSON-less input (DELETE with Content-Type: application/json)
  app.removeContentTypeParser("application/json")
  app.addContentTypeParser(["application/json", "application/merge-patch+json"], { parseAs: "string" }, (_req, body, done) => {
    const text = String(body)
    if (!text.trim()) return done(null, undefined)
    try {
      done(null, JSON.parse(text))
    } catch {
      done(problem(400, "validation_failed", { detail: "Body is not valid JSON" }), undefined)
    }
  })

  await app.register(cors, {
    origin: config.PWA_ORIGIN,
    credentials: true,
    allowedHeaders: ["Authorization", "Idempotency-Key", "If-Match", "If-None-Match", "X-Client-Version", "Content-Type"],
    exposedHeaders: ["Retry-After", "Date", "ETag", "X-Request-Id"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 600,
  })
  await app.register(compress, { global: true, threshold: 1024, encodings: ["br", "gzip", "deflate"] })
  await app.register(cookie)
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10 } })

  const apiPath = (req: FastifyRequest) => {
    const path = req.url.split("?")[0] ?? ""
    return path.startsWith(API_PREFIX) ? path.slice(API_PREFIX.length) || "/" : path
  }

  app.addHook("onRequest", async (req, reply) => {
    reply.header("X-Request-Id", req.id)
    req.viaRpc = req.headers["x-vscout-rpc"] === rpcSecret
    if (!req.url.startsWith(API_PREFIX)) return
    const path = apiPath(req)
    if (UNGATED.some((re) => re.test(path))) return
    const v = req.headers["x-client-version"]
    const version = Array.isArray(v) ? v[0] : v
    if (version && isValidSemver(version) && compareSemver(version, config.MIN_CLIENT_VERSION) < 0)
      throw problem(426, "upgrade_required", { minVersion: config.MIN_CLIENT_VERSION, detail: "Update the app to keep syncing" })
  })

  app.addHook("onSend", async (_req, reply, payload) => {
    if (config.COOKIE_SECURE) reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    reply.header("X-Content-Type-Options", "nosniff")
    return payload
  })

  app.setErrorHandler((err, req, reply) => {
    let p: HttpProblem
    if (err instanceof HttpProblem) p = err
    else {
      const e = err as { statusCode?: number; code?: string; message?: string }
      if (e.statusCode === 413 || e.code === "FST_REQ_FILE_TOO_LARGE" || e.code === "FST_ERR_CTP_BODY_TOO_LARGE")
        p = problem(413, "payload_too_large")
      else if (e.statusCode === 415 || e.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE")
        p = problem(415, "validation_failed", { detail: "Unsupported content type" })
      else if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500)
        p = problem(e.statusCode, "validation_failed", { detail: e.message ?? "Bad request" })
      else {
        req.log.error({ err }, "unhandled error")
        p = problem(500, "internal_error", { detail: "Something went wrong on the server" })
      }
    }
    for (const [k, v] of Object.entries(p.headers)) reply.header(k, v)
    reply.status(p.status).type("application/problem+json").send(p.body(req.id))
  })

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).type("application/problem+json").send(problem(404, "not_found", { detail: `No route ${req.method} ${apiPath(req)}` }).body(req.id))
  })

  const ctx: Ctx = {
    s,
    rpcSecret,
    auth(req) {
      req.principalPromise ??= s.guard.fromHeader(req.headers.authorization)
      return req.principalPromise
    },
    async idem(req, reply, p, fn) {
      const key = req.headers["idempotency-key"]
      const k = Array.isArray(key) ? key[0] : key
      const hash = requestHash(req.method, apiPath(req), (req.query ?? {}) as Record<string, unknown>, req.body ?? null)
      const result = await s.idempotency.run(p.id, k, hash, fn)
      return ctx.send(reply, result)
    },
    send(reply, r) {
      for (const [k, v] of Object.entries(r.headers ?? {})) reply.header(k, v)
      reply.status(r.status)
      if (r.status >= 400) reply.type("application/problem+json")
      if (r.body === null || r.body === undefined || r.status === 204) return reply.send()
      return reply.send(r.body)
    },
    apiPath,
    ip: (req) => req.ip,
  }

  await app.register(async (api) => registerRoutes(api, ctx), { prefix: API_PREFIX })
  // the broker fetches signing keys here (EMQX JWT authentication with JWKS)
  app.get("/.well-known/jwks.json", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=300")
    return s.tokens.jwks()
  })
  return { app, ctx }
}
