// Whether the tab bar shows (FX-11). Immersive pages (a chat thread, the alliance board) hide it
// while mounted; scrolling down a long page hides it until you scroll back up, like Safari.
type Reason = "page" | "scroll"

const listeners = new Set<() => void>()
const pageHolds = new Set<symbol>()
let scrolledAway = false

const notify = () => {
  for (const l of listeners) l()
}

export const tabBarStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  /** true while any reason hides the bar */
  hidden(): boolean {
    return pageHolds.size > 0 || scrolledAway
  },
  reason(): Reason | null {
    return pageHolds.size > 0 ? "page" : scrolledAway ? "scroll" : null
  },
  /** an immersive page hides the bar until the returned release is called */
  hold(): () => void {
    const token = Symbol("tab-bar-hold")
    pageHolds.add(token)
    notify()
    return () => {
      if (pageHolds.delete(token)) notify()
    }
  },
  setScrolledAway(next: boolean): void {
    if (scrolledAway === next) return
    scrolledAway = next
    notify()
  },
}

const TOP_ZONE = 80
const THRESHOLD = 12

/**
 * One scroll step: near the top the bar always shows; a clear move down hides it, a clear move up
 * shows it; small jitters keep the current state. Returns the new anchor and state.
 */
export function scrollStep(
  anchorY: number,
  y: number,
  away: boolean
): { anchorY: number; away: boolean } {
  if (y < TOP_ZONE) return { anchorY: y, away: false }
  if (y - anchorY > THRESHOLD) return { anchorY: y, away: true }
  if (anchorY - y > THRESHOLD) return { anchorY: y, away: false }
  // keep the anchor at the turning point so slow scrolls still add up
  return {
    anchorY: away ? Math.max(anchorY, y) : Math.min(anchorY, y),
    away,
  }
}
