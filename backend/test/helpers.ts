// Test harness: an in-memory server with a manual clock, a recording push sender, fake upstream
// APIs and a fake MQTT link. Requests go through Fastify's inject (no sockets).
import type { FastifyInstance } from "fastify"
import { buildApp } from "../src/app.js"
import type { Ctx } from "../src/app.js"
import { testConfig } from "../src/config.js"
import type { Config } from "../src/config.js"
import { ManualClock } from "../src/lib/clock.js"
import { uuidv7 } from "../src/lib/ids.js"
import type { PushSender, SendOptions, SubscriptionKeys } from "../src/push/push-service.js"
import type { MqttLink, PublishOptions } from "../src/realtime/publisher.js"
import { createServices } from "../src/services.js"
import type { Services } from "../src/services.js"

export const EVENT = "2026casj"

export class FakePush implements PushSender {
  sent: Array<{ endpoint: string; payload: Record<string, unknown>; opts: SendOptions }> = []
  /** endpoint → status to answer (default 201) */
  status = new Map<string, number>()
  async send(sub: SubscriptionKeys, payload: string, opts: SendOptions) {
    this.sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) as Record<string, unknown>, opts })
    return { status: this.status.get(sub.endpoint) ?? 201 }
  }
}

export class FakeLink implements MqttLink {
  connected = true
  messages: Array<{ topic: string; payload: Record<string, unknown>; opts: PublishOptions }> = []
  async publish(topic: string, payload: string | Buffer, opts: PublishOptions) {
    this.messages.push({ topic, payload: JSON.parse(String(payload)) as Record<string, unknown>, opts })
  }
  on(prefix: string) {
    return this.messages.filter((m) => m.topic.startsWith(prefix))
  }
  clear() {
    this.messages = []
  }
}

/** Upstream API stand-in: URL (prefix match) → JSON body, with ETags so 304s happen. */
export class FakeUpstream {
  routes = new Map<string, unknown>()
  calls: string[] = []
  fail = new Set<string>()
  fetch = async (url: string, init: { headers: Record<string, string> }): Promise<Response> => {
    this.calls.push(url)
    const match = [...this.routes.keys()].filter((k) => url.startsWith(k)).sort((a, b) => b.length - a.length)[0]
    if (!match || [...this.fail].some((f) => url.startsWith(f))) return new Response("nope", { status: match ? 500 : 404 })
    const body = JSON.stringify(this.routes.get(match))
    const etag = `"${Buffer.from(body).length}-${hash(body)}"`
    if (init.headers["If-None-Match"] === etag) return new Response(null, { status: 304 })
    return new Response(body, { status: 200, headers: { "content-type": "application/json", etag } })
  }
}

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

export interface Session {
  token: string
  userId: string
  deviceId: string
  cookie: string
  role: string
}

export interface Harness {
  s: Services
  app: FastifyInstance
  ctx: Ctx
  clock: ManualClock
  push: FakePush
  link: FakeLink
  upstream: FakeUpstream
  admin: Session
  req: (o: {
    method: string
    url: string
    as?: Session | null
    body?: unknown
    key?: string | null
    headers?: Record<string, string>
  }) => Promise<{ status: number; body: any; headers: Record<string, unknown> }>
  user: (username: string, role?: "admin" | "scouter") => Promise<Session>
  login: (username: string, password: string, deviceId?: string) => Promise<Session>
  guest: (code: string, deviceId?: string) => Promise<Session>
  close: () => Promise<void>
}

export async function harness(overrides: Partial<Config> = {}, opts: { event?: boolean } = {}): Promise<Harness> {
  const clock = new ManualClock(Date.parse("2026-03-20T16:00:00.000Z"))
  const push = new FakePush()
  const upstream = new FakeUpstream()
  const s = createServices(testConfig({ TBA_API_KEY: "tba-test", NEXUS_API_KEY: "nexus-test", ...overrides }), {
    clock,
    pushSender: push,
    fetcher: upstream.fetch,
    log: () => {},
  })
  const { app, ctx } = await buildApp(s)
  const link = new FakeLink()
  s.publisher.attach(link)
  const passwords = new Map<string, string>()

  const req: Harness["req"] = async (o) => {
    const headers: Record<string, string> = { "x-client-version": "2.0.0", ...(o.headers ?? {}) }
    if (o.as) headers.authorization = `Bearer ${o.as.token}`
    if (o.body !== undefined) headers["content-type"] = "application/json"
    if (o.key !== null && ["POST", "PUT", "PATCH", "DELETE"].includes(o.method)) headers["idempotency-key"] = o.key ?? uuidv7(clock.now())
    const res = await app.inject({
      method: o.method as "GET",
      url: o.url,
      headers,
      ...(o.body !== undefined ? { payload: JSON.stringify(o.body) } : {}),
    })
    let body: unknown = null
    try {
      body = res.body ? JSON.parse(res.body) : null
    } catch {
      body = res.body
    }
    return { status: res.statusCode, body, headers: res.headers as Record<string, unknown> }
  }

  const cookieOf = (setCookie: unknown) => {
    const raw = Array.isArray(setCookie) ? setCookie[0] : String(setCookie ?? "")
    return String(raw).split(";")[0] ?? ""
  }

  const login: Harness["login"] = async (username, password, deviceId) => {
    const dev = deviceId ?? `dev-${username}`
    const r = await req({ method: "POST", url: "/api/v1/auth/login", body: { username, password, deviceId: dev, deviceName: "test" } })
    if (r.status !== 200) throw new Error(`login ${username}: ${r.status} ${JSON.stringify(r.body)}`)
    return { token: r.body.accessToken, userId: r.body.user.id, deviceId: dev, cookie: cookieOf(r.headers["set-cookie"]), role: r.body.user.role }
  }

  const user: Harness["user"] = async (username, role = "scouter") => {
    const created = await s.users.create({ username, displayName: username[0]?.toUpperCase() + username.slice(1), role, password: `pw-${username}-123` })
    passwords.set(username, `pw-${username}-123`)
    s.settings.userSettings(String(created.user.id))
    return login(username, `pw-${username}-123`)
  }

  const guest: Harness["guest"] = async (code, deviceId = `guest-dev-${Math.random().toString(36).slice(2, 8)}`) => {
    const r = await req({ method: "POST", url: "/api/v1/auth/guest", body: { code, deviceId, deviceName: "tablet" } })
    if (r.status !== 200) throw new Error(`guest: ${r.status} ${JSON.stringify(r.body)}`)
    return { token: r.body.accessToken, userId: r.body.user.id, deviceId, cookie: cookieOf(r.headers["set-cookie"]), role: "guest" }
  }

  const admin = await user("alex", "admin")
  if (opts.event !== false) s.importer.createManualEvent({ eventKey: EVENT, name: "Silicon Valley Regional", startDate: "2026-03-19", endDate: "2026-03-22" })
  link.clear()

  return {
    s,
    app,
    ctx,
    clock,
    push,
    link,
    upstream,
    admin,
    req,
    user,
    login,
    guest,
    close: async () => {
      s.publisher.stop()
      s.sse.closeAll()
      await app.close()
      s.db.close()
    },
  }
}

export const id = () => uuidv7()

export function scoutEntryBody(o: Record<string, unknown> = {}) {
  return {
    id: id(),
    matchKey: `${EVENT}_qm1`,
    teamNumber: 254,
    station: "red1",
    scouterLevel: "experienced",
    gameId: "2026-rebuilt",
    schemaVersion: 1,
    data: { auto: { scored: 3 } },
    tags: [],
    ...o,
  }
}

export async function pullAll(h: Harness, as: Session, scope: string, entities: string[], cursors: Record<string, string> = {}) {
  const changes: any[] = []
  let cur = cursors
  for (let i = 0; i < 100; i++) {
    const r = await h.req({
      method: "GET",
      url: `/api/v1/sync/changes?scope=${encodeURIComponent(scope)}&entities=${entities.join(",")}&cursors=${encodeURIComponent(JSON.stringify(cur))}&limit=500`,
      as,
    })
    if (r.status !== 200) return { status: r.status, body: r.body, changes, cursors: cur }
    changes.push(...r.body.changes)
    cur = r.body.cursors
    if (!r.body.hasMore) break
  }
  return { status: 200, body: null, changes, cursors: cur }
}
