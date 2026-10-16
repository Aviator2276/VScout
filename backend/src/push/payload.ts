// The one push payload shape (REQUIREMENTS §10.5): Declarative Web Push, same for every platform,
// ≤ 3,000 bytes, titles and bodies from templates with control characters stripped.
import { createHash } from "node:crypto"
import { iso } from "../lib/clock.js"
import { uuidv7 } from "../lib/ids.js"

export type PushKind = "message" | "announcement" | "urgent" | "match" | "system"

export interface PushContent {
  kind: PushKind
  title: string
  body?: string
  url: string
  tag: string
  eventKey: string | null
  entity: { type: string; id: string } | null
  renotify?: boolean
}

export const MAX_PAYLOAD = 3000

export function clean(s: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  const flat = s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]+/g, " ").replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

export function buildPayload(c: PushContent, recipientId: string, pwaOrigin: string, now: number): Record<string, unknown> {
  const origin = pwaOrigin.replace(/\/+$/, "")
  const build = (bodyMax: number) => ({
    web_push: 8030,
    mutable: true,
    notification: {
      title: clean(c.title, 80) || "VScout",
      ...(c.body ? { body: clean(c.body, bodyMax) } : {}),
      navigate: `${origin}${c.url}`,
      tag: c.tag,
      lang: "en-US",
      dir: "ltr",
      icon: `${origin}/icons/icon-192.png`,
      badge: `${origin}/icons/badge-72.png`,
      silent: false,
      requireInteraction: c.kind === "urgent",
      renotify: c.renotify ?? c.kind !== "message",
      timestamp: now,
      data: {
        v: 1,
        id: uuidv7(now),
        kind: c.kind,
        url: c.url,
        uid: recipientId,
        eventKey: c.eventKey,
        entity: c.entity,
        ts: iso(now),
      },
    },
  })
  let p = build(240)
  // multi-byte text can push it over the limit: shorten the body until it fits
  for (let max = 200; Buffer.byteLength(JSON.stringify(p)) > MAX_PAYLOAD && max > 0; max -= 40) p = build(max)
  return p
}

/** Web Push `Topic` header: ≤ 32 chars of the URL-safe base64 alphabet. */
export function pushTopic(raw: string): string {
  const safe = raw.replace(/[^A-Za-z0-9_-]/g, "_")
  if (safe.length <= 32) return safe
  return createHash("sha256").update(raw).digest("base64url").slice(0, 32)
}
