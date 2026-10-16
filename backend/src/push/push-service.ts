// Web Push (REQUIREMENTS §10): subscriptions with an SSRF guard, triggers after commit, delivery
// with the push-service response rules, once per dedupe key.
import { timingSafeEqual } from "node:crypto"
import { z } from "zod"
import type { Db } from "../db/db.js"
import type { Bus } from "../domain/bus.js"
import type { Rec } from "../domain/entities.js"
import { dmParticipants } from "../domain/routing.js"
import type { Store } from "../domain/store.js"
import type { Users } from "../domain/users.js"
import type { Clock } from "../lib/clock.js"
import { iso } from "../lib/clock.js"
import { uuidv7 } from "../lib/ids.js"
import { problem, zodErrors } from "../lib/problem.js"
import { buildPayload, pushTopic } from "./payload.js"
import type { PushContent, PushKind } from "./payload.js"

export interface SendOptions {
  TTL: number
  urgency: "very-low" | "low" | "normal" | "high"
  topic?: string
}

export interface SubscriptionKeys {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** The transport: web-push in production, a recorder in tests. Returns the push service status. */
export interface PushSender {
  send(sub: SubscriptionKeys, payload: string, opts: SendOptions): Promise<{ status: number; retryAfter?: number }>
}

export interface SubscriptionRow {
  device_id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  platform: string | null
  created_at: number
  last_seen_at: number
  failures: number
  last_success_at: number | null
  last_failure_at: number | null
}

const ALLOWED_HOSTS = [
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
]

const b64 = (bytes: number) =>
  z.string().refine((s) => {
    try {
      return /^[A-Za-z0-9_-]+=*$/.test(s) && Buffer.from(s, "base64url").length === bytes
    } catch {
      return false
    }
  }, `${bytes}-byte base64url value`)

export const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: b64(65).refine((s) => Buffer.from(s, "base64url")[0] === 0x04, "uncompressed P-256 point"),
    auth: b64(16),
  }),
})

export function checkEndpoint(endpoint: string): void {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw problem(422, "invalid_endpoint")
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) throw problem(422, "invalid_endpoint")
  if (!ALLOWED_HOSTS.some((re) => re.test(url.hostname.toLowerCase()))) throw problem(422, "invalid_endpoint")
}

const PREF_DEFAULTS = {
  eventChat: "all",
  mutedChannelIds: [] as string[],
  directMessages: true,
  announcements: true,
  ourMatchQueue: true,
  watchedMatchQueue: false,
  matchLeadMinutes: 10,
}
export type Prefs = typeof PREF_DEFAULTS

export function prefsOf(settings: Rec | undefined): Prefs {
  const n = (settings?.notifications ?? {}) as Partial<Prefs>
  const lead = Number(n.matchLeadMinutes)
  return {
    eventChat: n.eventChat === "off" || n.eventChat === "mentions" ? n.eventChat : "all",
    mutedChannelIds: Array.isArray(n.mutedChannelIds) ? n.mutedChannelIds.map(String) : [],
    directMessages: n.directMessages !== false,
    announcements: n.announcements !== false,
    ourMatchQueue: n.ourMatchQueue !== false,
    watchedMatchQueue: n.watchedMatchQueue === true,
    matchLeadMinutes: Number.isFinite(lead) ? Math.min(30, Math.max(2, Math.round(lead))) : 10,
  }
}

const KIND_OPTS: Record<PushKind, Omit<SendOptions, "topic">> = {
  message: { TTL: 21600, urgency: "normal" },
  announcement: { TTL: 86400, urgency: "normal" },
  urgent: { TTL: 900, urgency: "high" },
  match: { TTL: 600, urgency: "high" },
  system: { TTL: 86400, urgency: "low" },
}

/** A small semaphore per push-service origin (~50 parallel requests, REQUIREMENTS §10.4). */
class Limiter {
  private active = new Map<string, number>()
  private waiting = new Map<string, Array<() => void>>()
  constructor(private max: number) {}
  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if ((this.active.get(key) ?? 0) >= this.max)
      await new Promise<void>((r) => this.waiting.set(key, [...(this.waiting.get(key) ?? []), r]))
    this.active.set(key, (this.active.get(key) ?? 0) + 1)
    try {
      return await fn()
    } finally {
      this.active.set(key, (this.active.get(key) ?? 1) - 1)
      const next = this.waiting.get(key)?.shift()
      next?.()
    }
  }
}

export interface PushStats {
  sent: number
  failed: number
  removed: number
}

export class PushService {
  private limiter = new Limiter(50)
  readonly stats: PushStats = { sent: 0, failed: 0, removed: 0 }
  /** in-flight deliveries (tests await them) */
  private inflight = new Set<Promise<unknown>>()

  constructor(
    private db: Db,
    private store: Store,
    private users: Users,
    private bus: Bus,
    private clock: Clock,
    private sender: PushSender | null,
    private pwaOrigin: string,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
  ) {
    bus.on("messageCreated", (m) => this.track(this.onMessage(m)))
    bus.on("dropPushDevices", ({ userId, deviceIds }) => {
      if (deviceIds?.length)
        for (const d of deviceIds) this.db.run("DELETE FROM push_subscriptions WHERE device_id = ? AND user_id = ?", d, userId)
      else this.db.run("DELETE FROM push_subscriptions WHERE user_id = ?", userId)
    })
  }

  get enabled() {
    return this.sender !== null
  }

  private track(p: Promise<unknown>) {
    const tracked = p.catch(() => {}).finally(() => this.inflight.delete(tracked))
    this.inflight.add(tracked)
  }

  async idle() {
    while (this.inflight.size) await Promise.all([...this.inflight])
  }

  // ---- subscriptions -------------------------------------------------------------------------

  upsert(userId: string, deviceId: string, body: unknown) {
    const parsed = z
      .object({ subscription: subscriptionSchema, platform: z.record(z.string(), z.unknown()).optional() })
      .safeParse(body)
    if (!parsed.success) {
      const endpointIssue = parsed.error.issues.some((i) => i.path.join(".") === "subscription.endpoint")
      throw problem(422, endpointIssue ? "invalid_endpoint" : "invalid_keys", { errors: zodErrors(parsed.error.issues) })
    }
    const { subscription, platform } = parsed.data
    checkEndpoint(subscription.endpoint)
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(deviceId)) throw problem(422, "validation_failed", { errors: [{ path: "deviceId", code: "invalid" }] })
    const now = this.clock.now()
    return this.db.tx(() => {
      // an endpoint belongs to one device: move it if it was registered elsewhere
      this.db.run("DELETE FROM push_subscriptions WHERE endpoint = ? AND device_id <> ?", subscription.endpoint, deviceId)
      const existing = this.db.get<SubscriptionRow>("SELECT * FROM push_subscriptions WHERE device_id = ?", deviceId)
      this.db.run(
        `INSERT INTO push_subscriptions (device_id, user_id, endpoint, p256dh, auth, platform, created_at, last_seen_at, failures)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(device_id) DO UPDATE SET user_id = excluded.user_id, endpoint = excluded.endpoint, p256dh = excluded.p256dh,
           auth = excluded.auth, platform = excluded.platform, last_seen_at = excluded.last_seen_at,
           failures = CASE WHEN push_subscriptions.endpoint = excluded.endpoint THEN push_subscriptions.failures ELSE 0 END`,
        deviceId,
        userId,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        platform ? JSON.stringify(platform) : null,
        now,
        now
      )
      return { deviceId, createdAt: iso(existing?.created_at ?? now), lastSeenAt: iso(now) }
    })
  }

  remove(userId: string, deviceId: string) {
    this.db.run("DELETE FROM push_subscriptions WHERE device_id = ? AND user_id = ?", deviceId, userId)
  }

  /** Called by the service worker on `pushsubscriptionchange` (no token): proven by the old auth secret. */
  rotate(body: unknown) {
    const parsed = z
      .object({ oldEndpoint: z.string().min(1).max(2000), oldAuth: z.string().min(1).max(64), subscription: subscriptionSchema })
      .safeParse(body)
    if (!parsed.success) throw problem(422, "validation_failed", { errors: zodErrors(parsed.error.issues) })
    const { oldEndpoint, oldAuth, subscription } = parsed.data
    checkEndpoint(subscription.endpoint)
    const row = this.db.get<SubscriptionRow>("SELECT * FROM push_subscriptions WHERE endpoint = ?", oldEndpoint)
    const a = Buffer.from(row?.auth ?? "x".repeat(22))
    const b = Buffer.from(oldAuth)
    const match = a.length === b.length && timingSafeEqual(a, b)
    if (!row || !match) throw problem(404, "unknown_subscription")
    this.db.tx(() => {
      this.db.run("DELETE FROM push_subscriptions WHERE endpoint = ? AND device_id <> ?", subscription.endpoint, row.device_id)
      this.db.run(
        "UPDATE push_subscriptions SET endpoint = ?, p256dh = ?, auth = ?, last_seen_at = ?, failures = 0 WHERE device_id = ?",
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        this.clock.now(),
        row.device_id
      )
    })
  }

  /** Daily: unseen for 30 days, or failing for 7 days without a success. */
  prune() {
    const now = this.clock.now()
    this.db.run("DELETE FROM push_subscriptions WHERE last_seen_at < ?", now - 30 * 86_400_000)
    this.db.run(
      "DELETE FROM push_subscriptions WHERE failures >= 5 AND COALESCE(last_success_at, 0) < ?",
      now - 7 * 86_400_000
    )
    this.db.run("DELETE FROM push_dedupe WHERE created_at < ?", now - 14 * 86_400_000)
  }

  statsView() {
    const subs = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM push_subscriptions")?.n ?? 0
    const failing = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM push_subscriptions WHERE failures > 0")?.n ?? 0
    return { subscriptions: subs, failingSubscriptions: failing, ...this.stats }
  }

  // ---- audiences -------------------------------------------------------------------------------

  private prefs(userId: string): Prefs {
    return prefsOf(this.store.live("userSettings", userId))
  }

  private staffIds(): string[] {
    return this.users.all().filter((u) => u.active === 1).map((u) => u.id)
  }

  private guestIds(eventKey: string): string[] {
    return this.db
      .all<{ user_id: string }>(
        "SELECT DISTINCT user_id FROM refresh_families WHERE guest_event_key = ? AND revoked_at IS NULL AND expires_at > ?",
        eventKey,
        this.clock.now()
      )
      .map((r) => r.user_id)
  }

  private isDemo(eventKey: string | null): boolean {
    return !!eventKey && this.store.live("event", eventKey)?.isDemo === true
  }

  private async onMessage(m: Rec) {
    if (!this.sender) return
    const eventKey = typeof m.eventKey === "string" ? m.eventKey : null
    if (this.isDemo(eventKey)) return
    const author = this.users.byId(String(m.authorId))
    const authorName = author?.display_name ?? "Someone"
    const channelId = String(m.channelId)
    const urgent = m.priority === "urgent"
    const entity = { type: "message", id: m.id }
    const preview = String(m.body ?? "")

    if (m.kind === "announcement") {
      const audience = [...this.staffIds(), ...(eventKey ? this.guestIds(eventKey) : [])].filter((u) => u !== m.authorId)
      const content: PushContent = {
        kind: urgent ? "urgent" : "announcement",
        title: urgent ? `Urgent: ${authorName}` : `Announcement from ${authorName}`,
        body: preview,
        url: "/messages/announcements",
        tag: `${urgent ? "urgent" : "announcement"}:${m.id}`,
        eventKey,
        entity,
      }
      const recipients = urgent ? audience : audience.filter((u) => u.startsWith("guest-") || this.prefs(u).announcements)
      await this.deliver(recipients, content, `${content.kind}:${m.id}`)
      return
    }

    const dm = dmParticipants(channelId)
    const url = `/messages/${channelId}`
    if (dm) {
      const other = dm[0] === m.authorId ? dm[1] : dm[0]
      const p = this.prefs(other)
      if (!urgent && (!p.directMessages || p.mutedChannelIds.includes(channelId))) return
      await this.deliver(
        [other],
        { kind: urgent ? "urgent" : "message", title: authorName, body: preview, url, tag: `message:${channelId}`, eventKey, entity, renotify: true },
        `message:${m.id}`
      )
      return
    }

    // event chat: admins and scouters only, never guests
    const parent = m.replyToId ? this.store.get("message", String(m.replyToId))?.data : undefined
    const lower = preview.toLowerCase()
    const recipients: string[] = []
    const renotifyFor = new Set<string>()
    for (const u of this.users.all()) {
      if (u.active !== 1 || u.id === m.authorId) continue
      const mentioned =
        lower.includes(`@${u.username.toLowerCase()}`) || lower.includes(`@${u.display_name.toLowerCase()}`) || parent?.authorId === u.id
      if (mentioned) renotifyFor.add(u.id)
      if (urgent) {
        recipients.push(u.id)
        continue
      }
      const p = this.prefs(u.id)
      if (p.mutedChannelIds.includes(channelId) || p.eventChat === "off") continue
      if (p.eventChat === "mentions" && !mentioned) continue
      recipients.push(u.id)
    }
    const base: PushContent = {
      kind: urgent ? "urgent" : "message",
      title: `${authorName} in event chat`,
      body: preview,
      url,
      tag: `message:${channelId}`,
      eventKey,
      entity,
    }
    const loud = recipients.filter((r) => renotifyFor.has(r))
    const quiet = recipients.filter((r) => !renotifyFor.has(r))
    await Promise.all([
      this.deliver(loud, { ...base, renotify: true }, `message:${m.id}`),
      this.deliver(quiet, { ...base, renotify: false }, `message:${m.id}`),
    ])
  }

  /** Sends one content to users (every device), at most once per (dedupeKey, user). */
  async deliver(userIds: string[], content: PushContent, dedupeKey: string, topic?: string): Promise<number> {
    if (!this.sender || !userIds.length) return 0
    const now = this.clock.now()
    const fresh = userIds.filter((u) => {
      const r = this.db.run("INSERT OR IGNORE INTO push_dedupe (key, created_at) VALUES (?, ?)", `${dedupeKey}|${u}`, now)
      return Number(r.changes) > 0
    })
    if (!fresh.length) return 0
    const opts: SendOptions = {
      ...KIND_OPTS[content.kind],
      topic: pushTopic(topic ?? (content.kind === "message" ? String(content.tag) : content.kind === "match" ? `m${content.entity?.id ?? ""}` : content.tag)),
    }
    let targeted = 0
    const jobs: Promise<void>[] = []
    for (const userId of fresh) {
      const subs = this.db.all<SubscriptionRow>("SELECT * FROM push_subscriptions WHERE user_id = ?", userId)
      const payload = JSON.stringify(buildPayload(content, userId, this.pwaOrigin, now))
      for (const s of subs) {
        targeted++
        jobs.push(this.limiter.run(new URL(s.endpoint).origin, () => this.sendOne(s, payload, opts, content.eventKey)))
      }
    }
    await Promise.all(jobs)
    return targeted
  }

  private async sendOne(s: SubscriptionRow, payload: string, opts: SendOptions, eventKey: string | null) {
    const sender = this.sender
    if (!sender) return
    let tries = 0
    for (;;) {
      tries++
      let status: number
      let retryAfter: number | undefined
      try {
        const r = await sender.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, opts)
        status = r.status
        retryAfter = r.retryAfter
      } catch {
        status = 0
      }
      const now = this.clock.now()
      if (status >= 200 && status < 300) {
        this.stats.sent++
        this.db.run("UPDATE push_subscriptions SET failures = 0, last_success_at = ? WHERE device_id = ?", now, s.device_id)
        return
      }
      if (status === 404 || status === 410) {
        this.stats.removed++
        this.db.run("DELETE FROM push_subscriptions WHERE device_id = ? AND endpoint = ?", s.device_id, s.endpoint)
        return
      }
      if (status === 400 || status === 403 || status === 413) {
        this.stats.failed++
        this.bus.emit("alert", {
          eventKey,
          kind: "pushRejected",
          message: status === 413 ? "A push payload was too large" : "A push service rejected our VAPID key or payload",
          detail: { status, origin: new URL(s.endpoint).origin },
        })
        this.markFailure(s.device_id, now)
        return
      }
      if (tries >= 3) {
        this.stats.failed++
        this.markFailure(s.device_id, now)
        return
      }
      const wait = status === 429 && retryAfter ? Math.min(retryAfter * 1000, opts.TTL * 1000) : 500 * 2 ** tries
      await this.sleep(wait)
    }
  }

  private markFailure(deviceId: string, now: number) {
    this.db.run("UPDATE push_subscriptions SET failures = failures + 1, last_failure_at = ? WHERE device_id = ?", now, deviceId)
  }

  /** POST /push/test: a system notification to the caller's own devices. */
  async test(userId: string): Promise<{ notificationId: string; targeted: number }> {
    const id = uuidv7(this.clock.now())
    const targeted = await this.deliver(
      [userId],
      { kind: "system", title: "Test notification", body: "Notifications work on this device.", url: "/settings/notifications", tag: `system:test`, eventKey: null, entity: null },
      `system:test:${id}`
    )
    return { notificationId: id, targeted }
  }
}
