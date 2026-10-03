// Each tab keeps its own navigation stack, like iOS (routing-auth §9, FX-10): switching tabs returns
// where you were, and Back walks back through the current tab's pages only, never into another tab
// you visited in between. Mirrored to sessionStorage: it survives a reload, not a new launch.
export type TabId = "home" | "matches" | "messages" | "teams" | "scout"

export const TAB_ROOTS: Record<TabId, string> = {
  home: "/",
  matches: "/matches",
  messages: "/messages",
  teams: "/teams",
  scout: "/scout",
}

const KEY = "vscout.tabs"

/** Settings and admin belong to Home's stack; scouting flows have no tab. */
export function tabForPath(pathname: string): TabId | null {
  const first = pathname.split("/")[1] ?? ""
  if (first === "" || first === "settings") return "home"
  if (
    first === "matches" ||
    first === "messages" ||
    first === "teams" ||
    first === "scout"
  )
    return first
  return null
}

const trimSlash = (pathname: string) => pathname.replace(/\/$/, "") || "/"

export function isTabRoot(pathname: string): boolean {
  return Object.values(TAB_ROOTS).includes(trimSlash(pathname))
}

const pathOf = (href: string) =>
  trimSlash(new URL(href, "https://vscout.invalid").pathname)

type Stacks = Partial<Record<TabId, Array<string>>>

function read(storage: Storage | undefined): Stacks {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.v === 2) return (parsed as { stacks: Stacks }).stacks
    // the old format kept one href per tab
    const stacks: Stacks = {}
    for (const [tab, href] of Object.entries(parsed))
      if (typeof href === "string") stacks[tab as TabId] = [href]
    return stacks
  } catch {
    return {}
  }
}

export function createTabMemory(storage?: Storage) {
  let stacks = read(storage)
  /** the last page remembered and whether it went deeper ("push") or back up ("pop") */
  let lastMove: { path: string; kind: "push" | "pop" } | null = null

  const save = () => {
    try {
      storage?.setItem(KEY, JSON.stringify({ v: 2, stacks }))
    } catch {
      // private mode or quota: memory still works for this session
    }
  }

  return {
    /**
     * Call on every resolved navigation. A tab root resets its stack, a page already in the stack
     * pops back to it (that's how Back and "up" links look), anything else is pushed.
     */
    remember(pathname: string, href: string): void {
      const tab = tabForPath(pathname)
      if (!tab) return
      const path = trimSlash(pathname)
      const stack = stacks[tab] ?? []
      let next: Array<string>
      const at = stack.findIndex((h) => pathOf(h) === path)
      if (isTabRoot(path)) next = [href]
      else next = at >= 0 ? [...stack.slice(0, at), href] : [...stack, href]
      if (at < 0 || at < stack.length - 1)
        lastMove = {
          path,
          kind: at >= 0 && at < stack.length - 1 ? "pop" : "push",
        }
      if (next.length === stack.length && next.every((h, i) => h === stack[i]))
        return
      stacks = { ...stacks, [tab]: next }
      save()
    },
    /** where tapping `tab` goes: the top of its stack, or its root */
    hrefFor(tab: TabId): string {
      return stacks[tab]?.at(-1) ?? TAB_ROOTS[tab]
    },
    /** the tab root with the search params it was left with (a re-tap pops to it) */
    rootFor(tab: TabId): string {
      const root = TAB_ROOTS[tab]
      const first = stacks[tab]?.[0]
      return first && pathOf(first) === root ? first : root
    },
    /** the page Back returns to from `pathname`, within its tab; null when there's none */
    backFor(pathname: string): string | null {
      const tab = tabForPath(pathname)
      if (!tab) return null
      const path = trimSlash(pathname)
      const stack = stacks[tab] ?? []
      const at = stack.findIndex((h) => pathOf(h) === path)
      // not remembered yet (Back tapped as the page appeared): the page we came from is the top
      if (at < 0) return isTabRoot(path) ? null : (stack.at(-1) ?? null)
      return stack[at - 1] ?? null
    },
    /**
     * Whether going to `pathname` is "back": it's under the top of its tab's stack, or it was
     * just remembered as a pop (the router may record the destination before the transition).
     */
    isBehind(pathname: string): boolean {
      const tab = tabForPath(pathname)
      if (!tab) return false
      const path = trimSlash(pathname)
      if (lastMove?.path === path) return lastMove.kind === "pop"
      return (stacks[tab] ?? []).slice(0, -1).some((h) => pathOf(h) === path)
    },
    reset(): void {
      stacks = {}
      lastMove = null
      try {
        storage?.removeItem(KEY)
      } catch {
        // ignore
      }
    },
  }
}

export type TabMemory = ReturnType<typeof createTabMemory>

let shared: TabMemory | null = null

export function getTabMemory(): TabMemory {
  shared ??= createTabMemory(
    typeof sessionStorage === "undefined" ? undefined : sessionStorage
  )
  return shared
}

/** Tab order, left to right: the direction of tab slides and swipes. */
export const TAB_ORDER: ReadonlyArray<TabId> = [
  "home",
  "matches",
  "messages",
  "teams",
  "scout",
]

const NO_TRANSITION = new Set(["login", "onboarding"])

/**
 * The view-transition type for a navigation (FX-13): `nav-forward` for a pushed page, `nav-back`
 * for going back up the tab's stack (by Back, a link or the browser), `tab-forward`/`tab-back` for
 * a tab switch in tab order. False for the first load, search-only changes and the sign-in flow.
 * Called before the new location is remembered, so the stack is still the one being left.
 */
export function navTransitionTypes(
  memory: Pick<TabMemory, "isBehind">,
  from: { pathname: string } | undefined,
  to: { pathname: string }
): Array<string> | false {
  if (!from) return false
  const a = trimSlash(from.pathname)
  const b = trimSlash(to.pathname)
  if (a === b) return false
  if ([a, b].some((p) => NO_TRANSITION.has(p.split("/")[1] ?? ""))) return false
  const fromTab = tabForPath(a)
  const toTab = tabForPath(b)
  if (fromTab && toTab && fromTab !== toTab)
    return [
      TAB_ORDER.indexOf(toTab) > TAB_ORDER.indexOf(fromTab)
        ? "tab-forward"
        : "tab-back",
    ]
  // leaving a flow outside the tabs (scouting) returns to the tab it came from
  if (!toTab && fromTab) return ["nav-forward"]
  if (toTab && !fromTab) return ["nav-back"]
  const back = isTabRoot(b) || memory.isBehind(b)
  return [back ? "nav-back" : "nav-forward"]
}
