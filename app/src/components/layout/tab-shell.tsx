// The four-tab shell (routing-auth §9, ui-patterns §1). Each tab returns to where you left it;
// tapping the active tab pops to its root, and tapping it at the root scrolls to the top.
import { useRouter, useRouterState } from "@tanstack/react-router"
import { useEffect } from "react"
import type { ReactNode } from "react"
import {
  CalendarDays,
  ClipboardList,
  House,
  UsersRound,
} from "@/components/icons/icon"
import { getTabMemory, isTabRoot, tabForPath } from "@/stores/tab-memory"
import type { TabId } from "@/stores/tab-memory"
import { TabBar } from "./tab-bar"
import type { TabItem } from "./tab-bar"

const TABS: ReadonlyArray<Omit<TabItem<TabId>, "href">> = [
  { id: "home", label: "Home", icon: House },
  { id: "matches", label: "Matches", icon: CalendarDays },
  { id: "teams", label: "Teams", icon: UsersRound },
  { id: "scout", label: "Scout", icon: ClipboardList },
]

export function TabShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const location = useRouterState({ select: (s) => s.resolvedLocation })
  const pathname = location?.pathname ?? "/"
  const href = location?.href ?? "/"
  const memory = getTabMemory()
  const active = tabForPath(pathname)

  useEffect(() => {
    memory.remember(pathname, href)
  }, [memory, pathname, href])

  const select = (tab: TabId) => {
    if (tab !== active) {
      void router.navigate({ href: memory.hrefFor(tab) })
      return
    }
    if (isTabRoot(pathname)) {
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })
    } else void router.navigate({ href: memory.rootFor(tab) })
  }

  return (
    <>
      {children}
      <TabBar
        items={TABS.map((t) => ({ ...t, href: memory.hrefFor(t.id) }))}
        active={active}
        onSelect={select}
      />
    </>
  )
}
