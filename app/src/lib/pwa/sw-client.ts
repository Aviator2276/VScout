// workbox-window behind UpdatePort (pwa-offline §6), plus the browser triggers (§6.1). Production
// only: the dev server never registers the service worker.
import type { Workbox } from "workbox-window"
import type { UpdateController, UpdatePort } from "./update-controller"

const VERSION_TIMEOUT_MS = 5_000
const INTERVAL_MS = 15 * 60_000

export function workboxPort(url = "/sw.js"): UpdatePort {
  // loaded on registration: workbox-window is CommonJS and must stay out of the Node prerender
  let wb: Workbox | null = null
  let registration: ServiceWorkerRegistration | undefined
  return {
    async register(h) {
      const { Workbox: WorkboxClass } = await import("workbox-window")
      wb = new WorkboxClass(url, { scope: "/", updateViaCache: "none" })
      wb.addEventListener("installing", () => h.onInstalling())
      wb.addEventListener("waiting", (e) =>
        h.onWaiting(e.wasWaitingBeforeRegister === true)
      )
      wb.addEventListener("controlling", () => h.onControlling())
      wb.addEventListener("activated", (e) =>
        h.onActivated(e.isUpdate === true)
      )
      registration = await wb.register()
    },
    update: () => wb?.update() ?? Promise.resolve(),
    hasWaiting: () => (registration?.waiting ?? null) !== null,
    waitingVersion() {
      const waiting = registration?.waiting
      if (!waiting) return Promise.resolve(null)
      // messageSW targets the active SW; ask the waiting one directly
      return new Promise((resolve) => {
        const channel = new MessageChannel()
        const timer = setTimeout(() => resolve(null), 2_000)
        channel.port1.onmessage = (e: MessageEvent<{ version?: unknown }>) => {
          clearTimeout(timer)
          resolve(typeof e.data.version === "string" ? e.data.version : null)
        }
        waiting.postMessage({ type: "GET_VERSION" }, [channel.port2])
      })
    },
    skipWaiting: () => wb?.messageSkipWaiting(),
    isControlled: () => navigator.serviceWorker.controller !== null,
  }
}

export async function fetchRemoteVersion(): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VERSION_TIMEOUT_MS)
  try {
    const res = await fetch("/version.json", {
      cache: "no-store",
      signal: controller.signal,
    })
    if (!res.ok) return null
    const body = (await res.json()) as { version?: unknown }
    return typeof body.version === "string" ? body.version : null
  } finally {
    clearTimeout(timer)
  }
}

/** visible, online and every 15 min while visible (§6.1); hidden → apply if safe (§7.3) */
export function attachUpdateTriggers(
  c: UpdateController,
  t: { window: Window; document: Document }
): () => void {
  let interval: ReturnType<typeof setInterval> | null = null
  const startInterval = () => {
    interval ??= setInterval(() => void c.check("interval"), INTERVAL_MS)
  }
  const stopInterval = () => {
    if (interval) clearInterval(interval)
    interval = null
  }
  const onVisibility = () => {
    if (t.document.visibilityState === "visible") {
      startInterval()
      void c.check("visible")
    } else {
      stopInterval()
      c.onHidden()
    }
  }
  const onOnline = () => void c.check("online")
  t.document.addEventListener("visibilitychange", onVisibility)
  t.window.addEventListener("online", onOnline)
  if (t.document.visibilityState === "visible") startInterval()
  return () => {
    stopInterval()
    t.document.removeEventListener("visibilitychange", onVisibility)
    t.window.removeEventListener("online", onOnline)
  }
}
