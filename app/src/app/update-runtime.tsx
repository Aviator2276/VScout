// App updates in the running app (pwa-offline §6–§8): registers the service worker (production
// only), applies a waiting update on a safe navigation or when backgrounded, and shows the banners.
import { useRouter, useRouterState } from "@tanstack/react-router"
import { useEffect, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import {
  ForcedUpdateBanner,
  UpdatedElsewhereBanner,
} from "@/components/layout/update-banner"
import type { ForcedUpdateCopy } from "@/components/layout/update-banner"
import { useToast } from "@/components/overlays/toaster"
import { APP_VERSION } from "@/config/version"
import { useOnline } from "@/hooks/use-online"
import { createUpdateController } from "@/lib/pwa/update-controller"
import type { UpdateController, UpdateState } from "@/lib/pwa/update-controller"
import { createStore } from "@/lib/mqtt/external-store"
import { isScoutingPath, updateGuard } from "@/lib/pwa/update-guard"
import {
  attachUpdateTriggers,
  fetchRemoteVersion,
  workboxPort,
} from "@/lib/pwa/sw-client"
import type { AppRuntime } from "./runtime"

let controller: UpdateController | null = null
/** null until the browser registers the SW (never during the prerender or in dev) */
const controllerStore = createStore<UpdateController | null>(null)
const useController = () =>
  useSyncExternalStore(
    controllerStore.subscribe,
    controllerStore.getSnapshot,
    () => null
  )

function getController(router: ReturnType<typeof useRouter>) {
  if (controller) return controller
  controller = createUpdateController({
    port: workboxPort(),
    current: APP_VERSION,
    guard: updateGuard,
    fetchRemoteVersion,
    isOnline: () => navigator.onLine,
    isVisible: () => document.visibilityState === "visible",
    pathname: () => router.state.location.pathname,
    reload: (href) => (href ? location.replace(href) : location.reload()),
    now: () => Date.now(),
    session: sessionStorage,
  })
  return controller
}

export function UpdateRuntime({
  app,
  children,
}: {
  app: () => AppRuntime
  children: ReactNode
}) {
  const router = useRouter()
  const toast = useToast()
  const c = useController()

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return
    const ctl = getController(router)
    controllerStore.set(ctl)
    void ctl.start().catch(() => ctl.markUnsupported())
    const detach = attachUpdateTriggers(ctl, { window, document })
    const unsubscribe = router.subscribe("onBeforeNavigate", (e) => {
      ctl.onBeforeNavigate({
        pathname: e.toLocation.pathname,
        href: e.toLocation.href,
      })
    })
    const runtime = app()
    const feedMin = () => {
      const min = runtime.minClientVersion.getSnapshot()
      if (min) ctl.setMinClientVersion(min)
    }
    feedMin()
    const offMin = runtime.minClientVersion.subscribe(feedMin)
    return () => {
      detach()
      unsubscribe()
      offMin()
    }
  }, [router, app])

  useEffect(() => {
    if (!c) return
    if (c.takeUpdatedFrom())
      toast.show({ title: `Updated to VScout ${APP_VERSION}.` })
  }, [c, toast])

  return children
}

const IDLE_STATE: UpdateState = {
  status: "idle",
  current: APP_VERSION,
  forced: false,
  offlineReady: false,
  updatedElsewhere: false,
}
const noop = () => () => undefined

/** The update banners for the current screen; rendered with the session banners. */
/** A waiting (not forced) update, for the System notification (notifications-center.md N4). */
export function useAppUpdate(): { ready: string | null; apply: () => void } {
  const c = useController()
  const state = useSyncExternalStore(
    c?.state.subscribe ?? noop,
    c?.state.getSnapshot ?? (() => IDLE_STATE),
    () => IDLE_STATE
  )
  const ready =
    state.status === "ready" && !state.forced ? (state.available ?? "") : null
  return { ready, apply: () => c?.apply() }
}

export function AppUpdateBanner() {
  const c = useController()
  const state = useSyncExternalStore(
    c?.state.subscribe ?? noop,
    c?.state.getSnapshot ?? (() => IDLE_STATE),
    () => IDLE_STATE
  )
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const online = useOnline()
  const forced = state.forced ? forcedCopy(state, pathname, online) : null
  useEffect(() => {
    // §8: a required update applies as soon as it's ready and safe
    if (forced === "updating" && c?.isSafeToApply()) c.apply()
  }, [forced, c])

  if (!c) return null
  if (state.updatedElsewhere)
    return <UpdatedElsewhereBanner onReload={() => location.reload()} />
  if (forced) return <ForcedUpdateBanner copy={forced} />
  // a plain "update ready" is a System notification (notifications-center.md N4)
  return null
}

function forcedCopy(
  s: UpdateState,
  pathname: string,
  online: boolean
): ForcedUpdateCopy {
  if (s.status === "ready" || s.status === "applying")
    return isScoutingPath(pathname) ? "finish-form" : "updating"
  if (s.status === "downloading") return "downloading"
  if (!online) return "offline"
  return "not-available"
}

/** The update controller and its state for Settings → Storage (null in dev and the prerender). */
export function useUpdateState(): {
  controller: UpdateController | null
  state: UpdateState
} {
  const c = useController()
  const state = useSyncExternalStore(
    c?.state.subscribe ?? noop,
    c?.state.getSnapshot ?? (() => IDLE_STATE),
    () => IDLE_STATE
  )
  return { controller: c, state }
}
