/// <reference lib="webworker" />
// Push in the service worker (push-notifications.md §6). It never writes domain data: it shows the
// notification, tells open windows (they sync), and on a click focuses a window and lets the app
// navigate. Never client.navigate(): that reloads and would lose a scouting form in progress.
import { guardPush } from "./lib/session-guard"
import { readPush } from "./lib/read-push"

declare const self: ServiceWorkerGlobalScope

const SESSION_CACHE = "vscout-session"
const SESSION_KEY = "/__vscout/session"

/** The signed-in user id, mirrored by the app (the SW has no Dexie session). */
export async function readSessionUid(): Promise<string | null> {
  const res = await (await caches.open(SESSION_CACHE)).match(SESSION_KEY)
  if (!res) return null
  const body = (await res.json()) as { uid?: unknown }
  return typeof body.uid === "string" ? body.uid : null
}

export async function writeSessionUid(uid: string | null): Promise<void> {
  const cache = await caches.open(SESSION_CACHE)
  await cache.put(SESSION_KEY, new Response(JSON.stringify({ uid })))
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let raw: unknown = null
      try {
        raw = event.data?.json() ?? null
      } catch {
        raw = null
      }
      const shown = guardPush(readPush(raw), await readSessionUid())
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      for (const w of windows)
        w.postMessage({ type: "push-received", data: shown.data })
      const visible = windows.some((w) => w.visibilityState === "visible")
      const silent = visible && shown.data?.kind !== "urgent"
      await self.registration.showNotification(shown.title, {
        ...shown.options,
        silent,
      })
      // not every browser has the Badging API
      if (shown.appBadge !== null && "setAppBadge" in self.navigator)
        await self.navigator.setAppBadge(shown.appBadge).catch(() => undefined)
    })()
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const data = event.notification.data as { url?: unknown } | null
  const url =
    typeof data?.url === "string" && data.url.startsWith("/") ? data.url : "/"
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      const existing = windows[0]
      if (existing) {
        await existing.focus()
        existing.postMessage({ type: "notification-click", url, data })
      } else await self.clients.openWindow(url)
    })()
  )
})
