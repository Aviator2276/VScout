// Service worker → app (push-notifications.md §6.3): a push arrived → sync; a notification was
// tapped → go there, unless a scouting form is open (then a toast offers to go, the form stays).
// Also mirrors the signed-in user id to the SW for the shared-device guard (§6.2).
import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"
import { useToast } from "@/components/overlays/toaster"
import { useSession } from "@/hooks/use-session"
import type { AppRuntime } from "./runtime"

function isPageMessage(
  v: unknown
): v is { type: string; url?: unknown; data?: unknown } {
  return typeof v === "object" && v !== null && "type" in v
}

export function usePushMessages(app: AppRuntime) {
  const router = useRouter()
  const toast = useToast()
  const session = useSession(app.auth)
  const uid = session?.userId ?? null

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return
    void navigator.serviceWorker.ready.then((reg) =>
      reg.active?.postMessage({ type: "SESSION", uid })
    )
  }, [uid])

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return
    const onMessage = (e: MessageEvent) => {
      const m: unknown = e.data
      if (!isPageMessage(m)) return
      if (m.type === "push-received") app.sync.requestSync("push")
      if (m.type === "notification-click" && typeof m.url === "string") {
        app.sync.requestSync("push-open", { force: true })
        const url = m.url.startsWith("/") ? m.url : "/"
        if (router.state.location.pathname.startsWith("/scouting"))
          toast.show({
            title: "New activity",
            action: {
              label: "View",
              onAction: () => void router.navigate({ href: url }),
            },
            timeout: 0,
          })
        else void router.navigate({ href: url })
      }
    }
    navigator.serviceWorker.addEventListener("message", onMessage)
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage)
  }, [app, router, toast])

  // users fix permissions in system settings: look again when the page comes back
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void app.push.reconcile()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [app])
}
