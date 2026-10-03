// Back, shared by the nav-bar Back button and the edge swipe (routing-auth §9.6, FX-10): within a
// tab, the previous page of that tab's own stack; with an empty stack (a cold deep link), the
// logical parent, or the tab's root. Pages outside the tabs (scouting) use browser history.
import type { RegisteredRouter } from "@tanstack/react-router"
import { getTabMemory, tabForPath } from "@/stores/tab-memory"

export function navigateBack(
  router: RegisteredRouter,
  parentHref?: string
): void {
  const { pathname } = router.state.location
  const memory = getTabMemory()
  const tab = tabForPath(pathname)
  if (tab) {
    const target = memory.backFor(pathname) ?? parentHref ?? memory.rootFor(tab)
    void router.navigate({ href: target })
  } else if (router.history.canGoBack()) router.history.back()
  else if (parentHref) void router.navigate({ href: parentHref, replace: true })
}
