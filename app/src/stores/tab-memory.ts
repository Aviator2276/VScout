// The last location per tab (routing-auth §9), so switching tabs returns where you were.
// Mirrored to sessionStorage: it survives a reload, not a new launch.
export type TabId = "home" | "matches" | "teams" | "scout"

export const TAB_ROOTS: Record<TabId, string> = {
  home: "/",
  matches: "/matches",
  teams: "/teams",
  scout: "/scout",
}

const KEY = "vscout.tabs"

/** Settings and admin belong to Home's stack; scouting flows have no tab. */
export function tabForPath(pathname: string): TabId | null {
  const first = pathname.split("/")[1] ?? ""
  if (first === "" || first === "settings") return "home"
  if (first === "matches" || first === "teams" || first === "scout")
    return first
  return null
}

export function isTabRoot(pathname: string): boolean {
  return Object.values(TAB_ROOTS).includes(pathname.replace(/\/$/, "") || "/")
}

function read(storage: Storage | undefined): Partial<Record<TabId, string>> {
  try {
    const raw = storage?.getItem(KEY)
    return raw ? (JSON.parse(raw) as Partial<Record<TabId, string>>) : {}
  } catch {
    return {}
  }
}

export function createTabMemory(storage?: Storage) {
  let hrefs = read(storage)
  return {
    /** call on every resolved navigation */
    remember(pathname: string, href: string): void {
      const tab = tabForPath(pathname)
      if (!tab || hrefs[tab] === href) return
      hrefs = { ...hrefs, [tab]: href }
      try {
        storage?.setItem(KEY, JSON.stringify(hrefs))
      } catch {
        // private mode or quota: memory still works for this session
      }
    },
    /** where tapping `tab` goes: its last href, or its root */
    hrefFor(tab: TabId): string {
      return hrefs[tab] ?? TAB_ROOTS[tab]
    },
    /** the tab root with the search params it was left with (a re-tap pops to it) */
    rootFor(tab: TabId): string {
      const last = hrefs[tab]
      const root = TAB_ROOTS[tab]
      if (!last) return root
      const url = new URL(last, "https://vscout.invalid")
      return url.pathname === root ? last : root
    },
    reset(): void {
      hrefs = {}
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
