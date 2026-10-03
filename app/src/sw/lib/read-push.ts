// Normalizes a push into what showNotification needs (push-notifications.md §6.1): Safari 18.4+
// declarative-mutable, raw JSON with web_push 8030 (Chrome, Firefox, iOS 16.4–18.3), or anything
// else (a generic notification). Pure; unit-tested.
import { pushPayload } from "../../lib/contracts/push"
import type { PushPayload } from "../../lib/contracts/push"

export interface ShownPush {
  title: string
  options: NotificationOptions & { data?: unknown; renotify?: boolean }
  appBadge: number | null
  data: PushPayload["notification"]["data"] | null
}

export const GENERIC: ShownPush = {
  title: "VScout",
  options: {
    body: "Open the app to see new activity.",
    tag: "generic",
    data: { url: "/" },
  },
  appBadge: null,
  data: null,
}

export function readPush(raw: unknown): ShownPush {
  const parsed = pushPayload.safeParse(raw)
  if (!parsed.success) return GENERIC
  const n = parsed.data.notification
  return {
    title: n.title,
    options: {
      ...(n.body ? { body: n.body } : {}),
      tag: n.tag,
      ...(n.requireInteraction ? { requireInteraction: true } : {}),
      ...(n.renotify ? { renotify: true } : {}),
      ...(n.timestamp ? { timestamp: n.timestamp } : {}),
      icon: "/icons/icon-192.png",
      badge: "/icons/monochrome-96.png",
      data: n.data,
    },
    appBadge: n.app_badge ?? null,
    data: n.data,
  }
}
