// The five-tab shell (routing-auth §9, ui-patterns §1, FX-10…FX-12). Each tab keeps its own stack
// and returns to where you left it; tapping the active tab pops to its root, and tapping it at the
// root scrolls to the top. The tab bar hides on immersive pages and while scrolling down.
import { useRouter, useRouterState } from "@tanstack/react-router"
import type { AnyRoute } from "@tanstack/react-router"
import { useEffect, useState, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import {
  CalendarDays,
  ClipboardList,
  House,
  MessageCircle,
  UsersRound,
} from "@/components/icons/icon"
import { appBackground } from "@/config/app-backgrounds"
import { usePrefs } from "@/hooks/use-prefs"
import { useTabBarHidden } from "@/hooks/use-tab-bar"
import { scrollStep, tabBarStore } from "@/stores/tab-bar"
import {
  TAB_ROOTS,
  getTabMemory,
  isTabRoot,
  tabForPath,
} from "@/stores/tab-memory"
import type { TabId } from "@/stores/tab-memory"
import { AppBackdrop } from "./app-backdrop"
import { navigateBack } from "./navigate-back"
import { canStartSwipe, swipeAction } from "./swipe-nav"
import { TabBar } from "./tab-bar"
import type { TabItem } from "./tab-bar"

/** A scroll this soon after a touch, wheel or key counts as the user's (momentum included). */
const USER_SCROLL_MS = 1000

/** Installed app: no browser edge-swipe competes with ours. */
const standalone = () =>
  matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true

/** Tab order: also the direction of tab slides and swipes. */
export const TABS: ReadonlyArray<Omit<TabItem<TabId>, "href">> = [
  { id: "home", label: "Home", icon: House },
  { id: "matches", label: "Matches", icon: CalendarDays },
  { id: "messages", label: "Messages", icon: MessageCircle, center: true },
  { id: "teams", label: "Teams", icon: UsersRound },
  { id: "scout", label: "Scout", icon: ClipboardList },
]

export function TabShell({
  children,
  badges = {},
}: {
  children: ReactNode
  /** unread counts per tab (the app layer computes them) */
  badges?: Partial<Record<TabId, number>>
}) {
  const router = useRouter()
  // the rendered location: "resolved" can lag behind (view transitions), and a quick tap on the
  // new page must already find it in its tab's stack
  const location = useRouterState({ select: (s) => s.location })
  const pathname = location.pathname
  const href = location.href
  const memory = getTabMemory()
  // the tab the user is in: a link from a team to a match stays in Teams (owner)
  useSyncExternalStore(memory.subscribe, memory.version, memory.version)
  const active = memory.currentTab() ?? tabForPath(pathname)
  const hidden = useTabBarHidden()

  useEffect(() => {
    memory.remember(pathname, href)
  }, [memory, pathname, href])

  // Load every tab's code once the first page has painted, so the first visit to a tab doesn't
  // wait for its chunk behind a pending skeleton (FX-1). Loaders are cheap Dexie reads.
  useEffect(() => {
    const preload = () => {
      for (const to of [...Object.values(TAB_ROOTS), "/settings"])
        void router.preloadRoute({ to }).catch(() => undefined)
      // and every other page's code (team, match, settings pages…): no first-visit skeleton
      for (const route of Object.values(router.routesById) as Array<AnyRoute>)
        void router.loadRouteChunk(route)?.catch(() => undefined)
    }
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(preload, { timeout: 2000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(preload, 500)
    return () => clearTimeout(id)
  }, [router])

  // Scrolling down hides the bar, scrolling up brings it back (FX-11). A new page starts shown.
  // Only the user's own scrolling counts: a page jumping to "now" or restoring its scroll
  // position mustn't hide the bar.
  // A new page shows the bar at once: sliding it back up after a scroll-hide looked like the bar
  // flying in again (owner). Derived during render when the path changes, cleared two frames later.
  const [instant, setInstant] = useState(false)
  const [seenPath, setSeenPath] = useState(pathname)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    if (hidden && !tabBarStore.heldByPage()) setInstant(true)
  }
  useEffect(() => {
    if (!instant) return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setInstant(false))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [instant])
  useEffect(() => {
    let state = { anchorY: window.scrollY, away: false }
    let lastInput = -Infinity
    tabBarStore.setScrolledAway(false)
    let frame = 0
    const onInput = (e: Event) => {
      lastInput = e.timeStamp
    }
    const onScroll = (e: Event) => {
      const byUser = e.timeStamp - lastInput < USER_SCROLL_MS
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!byUser) {
          state = { anchorY: window.scrollY, away: state.away }
          return
        }
        state = scrollStep(state.anchorY, window.scrollY, state.away)
        tabBarStore.setScrolledAway(state.away)
      })
    }
    const inputs = ["touchmove", "wheel", "keydown"] as const
    for (const type of inputs)
      window.addEventListener(type, onInput, { passive: true })
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      for (const type of inputs) window.removeEventListener(type, onInput)
      window.removeEventListener("scroll", onScroll)
      tabBarStore.setScrolledAway(false)
    }
  }, [pathname])

  // The chosen background shows behind the tab screens only (owner); on pushed pages it fades to
  // the plain background (AppBackdrop) instead of the page covering it.
  const background = appBackground(usePrefs().appBackground)
  const onRoot = isTabRoot(pathname)
  useEffect(() => {
    const root = document.documentElement
    if (background.style) root.dataset.appBg = background.id
    else delete root.dataset.appBg
    return () => {
      delete root.dataset.appBg
    }
  }, [background])

  // Bottom-fixed controls (composer, Record Pick, toasts) sit on --tabbar-offset (styles.css).
  useEffect(() => {
    const root = document.documentElement
    root.dataset.tabbar = hidden ? "hidden" : "shown"
    return () => {
      delete root.dataset.tabbar
    }
  }, [hidden])

  // Swipe between tabs on a tab root; swipe right from the left edge to go Back (FX-13).
  useEffect(() => {
    let start: { x: number; y: number; t: number } | null = null
    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      start =
        e.touches.length === 1 && touch && canStartSwipe(e.target)
          ? { x: touch.clientX, y: touch.clientY, t: e.timeStamp }
          : null
    }
    const onEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0]
      if (!start || !touch) return
      const path = router.state.location.pathname
      const action = swipeAction({
        dx: touch.clientX - start.x,
        dy: touch.clientY - start.y,
        ms: e.timeStamp - start.t,
        startX: start.x,
        atTabRoot: isTabRoot(path),
      })
      start = null
      const tab = memory.currentTab() ?? tabForPath(path)
      if (!action || !tab) return
      if (action === "back") {
        if (standalone()) navigateBack(router)
        return
      }
      const i = TABS.findIndex((t) => t.id === tab)
      const next = TABS[action === "next-tab" ? i + 1 : i - 1]
      if (next) {
        memory.switchTo(next.id)
        void router.navigate({ href: memory.hrefFor(next.id) })
      }
    }
    const cancel = () => {
      start = null
    }
    document.addEventListener("touchstart", onStart, { passive: true })
    document.addEventListener("touchend", onEnd, { passive: true })
    document.addEventListener("touchcancel", cancel, { passive: true })
    return () => {
      document.removeEventListener("touchstart", onStart)
      document.removeEventListener("touchend", onEnd)
      document.removeEventListener("touchcancel", cancel)
    }
  }, [router, memory])

  const select = (tab: TabId) => {
    if (tab !== active) {
      memory.switchTo(tab)
      void router.navigate({ href: memory.hrefFor(tab) })
      return
    }
    if (isTabRoot(pathname)) {
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })
    } else {
      memory.switchTo(tab)
      void router.navigate({ href: memory.rootFor(tab) })
    }
  }

  return (
    <>
      <AppBackdrop background={background} visible={onRoot} />
      {children}
      <TabBar
        items={TABS.map((t) => ({
          ...t,
          href: memory.hrefFor(t.id),
          badge: badges[t.id] ?? 0,
        }))}
        active={active}
        onSelect={select}
        hidden={hidden}
        instant={instant}
      />
    </>
  )
}
