// Browser events → connection machine events (mqtt.md §3.3). Returns a detach function.
import type { MqttConnection } from "./mqtt-client"

export interface LifecycleTargets {
  window: Pick<Window, "addEventListener" | "removeEventListener">
  document: Pick<
    Document,
    "addEventListener" | "removeEventListener" | "visibilityState"
  >
  now?: () => number
}

export function attachLifecycle(
  conn: Pick<MqttConnection, "handle">,
  t: LifecycleTargets
): () => void {
  const now = t.now ?? (() => Date.now())
  let hiddenAt: number | null = null
  const onVisibility = () => {
    if (t.document.visibilityState === "hidden") {
      hiddenAt = now()
      conn.handle({ type: "HIDDEN" })
    } else {
      const hiddenMs = hiddenAt === null ? 0 : now() - hiddenAt
      hiddenAt = null
      conn.handle({ type: "VISIBLE", hiddenMs })
    }
  }
  const onPageShow = (e: Event) => {
    if ((e as PageTransitionEvent).persisted)
      conn.handle({ type: "VISIBLE", hiddenMs: Infinity })
  }
  const onOnline = () => conn.handle({ type: "ONLINE" })
  const onOffline = () => conn.handle({ type: "OFFLINE" })

  t.document.addEventListener("visibilitychange", onVisibility)
  t.window.addEventListener("pageshow", onPageShow)
  t.window.addEventListener("online", onOnline)
  t.window.addEventListener("offline", onOffline)
  return () => {
    t.document.removeEventListener("visibilitychange", onVisibility)
    t.window.removeEventListener("pageshow", onPageShow)
    t.window.removeEventListener("online", onOnline)
    t.window.removeEventListener("offline", onOffline)
  }
}
