// Real delivery through the `web-push` library: VAPID (JWT ≤ 24 h) and aes128gcm encryption.
import webpush from "web-push"
import type { PushSender, SendOptions, SubscriptionKeys } from "./push-service.js"

export function createWebPushSender(vapid: { subject: string; publicKey: string; privateKey: string }): PushSender {
  return {
    async send(sub: SubscriptionKeys, payload: string, opts: SendOptions) {
      try {
        const r = await webpush.sendNotification(sub, payload, {
          TTL: opts.TTL,
          urgency: opts.urgency,
          ...(opts.topic ? { topic: opts.topic } : {}),
          contentEncoding: "aes128gcm",
          vapidDetails: vapid,
          timeout: 15_000,
        })
        return { status: r.statusCode }
      } catch (e) {
        if (e instanceof webpush.WebPushError) {
          const ra = Number(e.headers?.["retry-after"])
          return { status: e.statusCode, ...(Number.isFinite(ra) ? { retryAfter: ra } : {}) }
        }
        throw e
      }
    },
  }
}

export function generateVapidKeys() {
  return webpush.generateVAPIDKeys()
}
