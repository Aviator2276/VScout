// Browser events → sync requests (data-layer §7.2). Returns a detach function.
import type { SyncEngine } from "./engine"

export function attachSyncTriggers(
  engine: Pick<SyncEngine, "requestSync" | "setVisible">,
  t: {
    window: Pick<Window, "addEventListener" | "removeEventListener">
    document: Pick<
      Document,
      "addEventListener" | "removeEventListener" | "visibilityState"
    >
  }
): () => void {
  const onVisibility = () => {
    const visible = t.document.visibilityState === "visible"
    engine.setVisible(visible)
    if (visible) engine.requestSync("visible")
  }
  const onOnline = () => engine.requestSync("online")
  t.document.addEventListener("visibilitychange", onVisibility)
  t.window.addEventListener("online", onOnline)
  return () => {
    t.document.removeEventListener("visibilitychange", onVisibility)
    t.window.removeEventListener("online", onOnline)
  }
}
