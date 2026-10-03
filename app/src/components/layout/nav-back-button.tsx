// Back (routing-auth §9.6, FX-10): within a tab, the previous page of that tab's own stack, never a
// page from another tab visited in between. With nothing in the stack (a cold deep link from a
// notification), the logical parent. Pages outside the tabs (scouting) use browser history.
import { useRouter, useRouterState } from "@tanstack/react-router"
import { useSyncExternalStore } from "react"
import { ChevronLeft } from "@/components/icons/icon"
import { getTabMemory } from "@/stores/tab-memory"
import { navigateBack } from "./navigate-back"

export function NavBackButton({
  parentHref,
  label,
}: {
  parentHref: string
  /** shown when the previous page's title isn't known (a cold deep link) */
  label?: string
}) {
  const router = useRouter()
  const memory = getTabMemory()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  useSyncExternalStore(memory.subscribe, memory.version, memory.version)
  // like iOS: the previous page's title, so Back reads right when it crosses sections (owner)
  const title = memory.backTitle(pathname) ?? label ?? null
  const back = () => navigateBack(router, parentHref)
  return (
    <button
      type="button"
      onClick={back}
      aria-label={title ? `Back to ${title}` : "Back"}
      // a liquid-glass capsule (owner); the 44 pt hit area extends past it
      className="hit-44 -ml-1 inline-flex h-9 max-w-[9.5rem] items-center gap-0.5 rounded-full glass-button pr-3 pl-1 text-body text-primary transition-[scale] active:scale-95"
    >
      <ChevronLeft aria-hidden size={22} className="shrink-0" />
      {title ? <span className="truncate">{title}</span> : null}
    </button>
  )
}
