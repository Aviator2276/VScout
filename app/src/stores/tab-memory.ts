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

interface Saved {
  stacks: Stacks
  current: TabId | null
}

function read(storage: Storage | undefined): Saved {
  const empty: Saved = { stacks: {}, current: null }
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.v === 3) return parsed as unknown as Saved
    if (parsed.v === 2)
      return { stacks: (parsed as { stacks: Stacks }).stacks, current: null }
    // the oldest format kept one href per tab
    const stacks: Stacks = {}
    for (const [tab, href] of Object.entries(parsed))
      if (typeof href === "string") stacks[tab as TabId] = [href]
    return { stacks, current: null }
  } catch {
    return empty
  }
}

export function createTabMemory(storage?: Storage) {
  const saved = read(storage)
  let stacks = saved.stacks
  /** the tab the user is in: in-app links keep pages in its stack (owner: team → match → Back) */
  let current: TabId | null = saved.current
  /** set by the tab bar and tab swipes just before they navigate: a real tab switch */
  let pendingTab: TabId | null = null
  /** the last page remembered and whether it went deeper ("push") or back up ("pop") */
  let lastMove: { path: string; kind: "push" | "pop" } | null = null
  /**
   * The last page that switched tabs, and between which tabs. The router works out the slide after
   * the new page has loaded, and by then the shell may have remembered it (owner: tab swipes always
   * slid the same way), so the direction is kept here.
   */
  let lastSwitch: { path: string; from: TabId; to: TabId } | null = null
  /** page titles by path, for the Back button's label */
  const titles = new Map<string, string>()
  const listeners = new Set<() => void>()
  let version = 0
  const notify = () => {
    version++
    for (const l of listeners) l()
  }

  const save = () => {
    try {
      storage?.setItem(KEY, JSON.stringify({ v: 3, stacks, current }))
    } catch {
      // private mode or quota: memory still works for this session
    }
  }

  /** Which tab's stack a page joins: a tab switch or a tab root picks its tab; links stay put. */
  const ownerFor = (path: string): TabId | null => {
    if (pendingTab) return pendingTab
    if (isTabRoot(path)) return tabForPath(path)
    return current ?? tabForPath(path)
  }

  /** the stack holding `pathname`: the current tab's, else whichever has it, else its own tab's */
  const stackOf = (pathname: string): Array<string> => {
    const path = trimSlash(pathname)
    const has = (tab: TabId | null) =>
      tab !== null && (stacks[tab] ?? []).some((h) => pathOf(h) === path)
    if (has(current) && current) return stacks[current] ?? []
    const found = TAB_ORDER.find((t) => has(t))
    if (found) return stacks[found] ?? []
    const tab = current ?? tabForPath(pathname)
    return tab ? (stacks[tab] ?? []) : []
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    version: () => version,
    /** the tab bar or a tab swipe is about to go to `tab` (not a link) */
    switchTo(tab: TabId): void {
      pendingTab = tab
    },
    /** the tab a pending navigation switches to, if any */
    pendingSwitch: () => pendingTab,
    /** the tab switch that brought up `pathname`, if it was the last one remembered */
    switchedTo: (pathname: string) =>
      lastSwitch?.path === trimSlash(pathname) ? lastSwitch : null,
    /** the tab the user is in (the tab bar highlights it) */
    currentTab: (): TabId | null => current,
    /**
     * Call on every rendered navigation. The page joins its owner's stack (see ownerFor): a tab
     * root resets the stack, a page already in it pops back to it (Back, "up" links), anything
     * else is pushed. Pages outside the tabs (scouting, sign-in) don't join any stack.
     */
    remember(pathname: string, href: string): void {
      if (!tabForPath(pathname)) return
      const tab = ownerFor(trimSlash(pathname))
      pendingTab = null
      if (!tab) return
      const path = trimSlash(pathname)
      const stack = stacks[tab] ?? []
      let next: Array<string>
      const at = stack.findIndex((h) => pathOf(h) === path)
      if (isTabRoot(path) && tabForPath(path) === tab) next = [href]
      else next = at >= 0 ? [...stack.slice(0, at), href] : [...stack, href]
      if (at < 0 || at < stack.length - 1)
        lastMove = {
          path,
          kind: at >= 0 && at < stack.length - 1 ? "pop" : "push",
        }
      const changedTab = current !== tab
      lastSwitch =
        changedTab && current ? { path, from: current, to: tab } : null
      current = tab
      if (
        !changedTab &&
        next.length === stack.length &&
        next.every((h, i) => h === stack[i])
      )
        return
      stacks = { ...stacks, [tab]: next }
      save()
      notify()
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
    /** the page Back returns to from `pathname`, in the current tab's stack; null when none */
    backFor(pathname: string): string | null {
      if (!tabForPath(pathname)) return null
      const path = trimSlash(pathname)
      const stack = stackOf(pathname)
      const at = stack.findIndex((h) => pathOf(h) === path)
      // not remembered yet (Back tapped as the page appeared): the page we came from is the top
      if (at < 0) return isTabRoot(path) ? null : (stack.at(-1) ?? null)
      return stack[at - 1] ?? null
    },
    /**
     * Whether going to `pathname` is "back": it's under the top of the current stack, or it was
     * just remembered as a pop (the router may record the destination before the transition).
     */
    isBehind(pathname: string): boolean {
      if (!tabForPath(pathname)) return false
      const path = trimSlash(pathname)
      if (lastMove?.path === path) return lastMove.kind === "pop"
      return stackOf(pathname)
        .slice(0, -1)
        .some((h) => pathOf(h) === path)
    },
    /** a page's title, for the Back button on the page after it */
    setTitle(pathname: string, title: string): void {
      const path = trimSlash(pathname)
      if (titles.get(path) === title) return
      titles.set(path, title)
      notify()
    },
    /** the title of the page Back goes to from `pathname`, if known */
    backTitle(pathname: string): string | null {
      const target = this.backFor(pathname)
      return target ? (titles.get(pathOf(target)) ?? null) : null
    },
    reset(): void {
      stacks = {}
      current = null
      pendingTab = null
      lastMove = null
      lastSwitch = null
      titles.clear()
      try {
        storage?.removeItem(KEY)
      } catch {
        // ignore
      }
      notify()
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
  memory: Pick<
    TabMemory,
    "isBehind" | "pendingSwitch" | "currentTab" | "switchedTo"
  >,
  from: { pathname: string } | undefined,
  to: { pathname: string }
): Array<string> | false {
  if (!from) return false
  const a = trimSlash(from.pathname)
  const b = trimSlash(to.pathname)
  if (a === b) return false
  if ([a, b].some((p) => NO_TRANSITION.has(p.split("/")[1] ?? ""))) return false
  const tabDirection = (from: TabId, to: TabId) =>
    TAB_ORDER.indexOf(to) > TAB_ORDER.indexOf(from) ? "tab-forward" : "tab-back"
  // the shell may already have remembered the new page (it loaded first)
  const switched = memory.switchedTo(b)
  if (switched) return [tabDirection(switched.from, switched.to)]
  const fromTab = tabForPath(a) ? (memory.currentTab() ?? tabForPath(a)) : null
  const toTab = tabForPath(b)
    ? (memory.pendingSwitch() ??
      (isTabRoot(b) ? tabForPath(b) : (fromTab ?? tabForPath(b))))
    : null
  if (fromTab && toTab && fromTab !== toTab)
    return [tabDirection(fromTab, toTab)]
  // leaving a flow outside the tabs (scouting) returns to the tab it came from
  if (!toTab && fromTab) return ["nav-forward"]
  if (toTab && !fromTab) return ["nav-back"]
  const back = isTabRoot(b) || memory.isBehind(b)
  return [back ? "nav-back" : "nav-forward"]
}
