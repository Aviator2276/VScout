// The launch screen (FX-7, HIG Launching): the logo on the app background, part of the prerendered
// shell so it paints before any JavaScript runs. It fades out once the first route has resolved,
// instead of the app opening on a skeleton. Hidden through a class on <html>, so hydration never
// sees a changed element.
import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"

const READY_CLASS = "app-ready"
/** Never keep the splash up longer than this, whatever the router does. */
const MAX_MS = 4_000

export function SplashScreen() {
  return (
    <div
      id="splash"
      aria-hidden
      className="pointer-events-none fixed inset-0 z-100 flex items-center justify-center bg-background transition-opacity duration-300 [.app-ready_&]:invisible [.app-ready_&]:opacity-0"
    >
      <img
        src="/icons/logo-256.png"
        width={112}
        height={112}
        alt=""
        draggable={false}
        fetchPriority="high"
        className="select-none"
      />
    </div>
  )
}

/** Fades the splash out after the first route resolves (or after MAX_MS). */
export function useHideSplash() {
  const router = useRouter()
  useEffect(() => {
    const root = document.documentElement
    if (root.classList.contains(READY_CLASS)) return
    let frame = 0
    const hide = () => {
      cancelAnimationFrame(frame)
      // one frame later, so the resolved page has painted under the splash
      frame = requestAnimationFrame(() => root.classList.add(READY_CLASS))
    }
    const timer = setTimeout(hide, MAX_MS)
    const unsubscribe =
      router.state.status === "idle" && router.state.resolvedLocation
        ? (hide(), () => undefined)
        : router.subscribe("onResolved", hide)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      unsubscribe()
    }
  }, [router])
}
