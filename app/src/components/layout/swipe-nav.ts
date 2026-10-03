// Swipe navigation (FX-13): on a tab root, a horizontal swipe moves to the neighboring tab, like
// tapping it; on a pushed page, a swipe right from the left edge goes Back, like iOS. Touches that
// start in something that handles horizontal movement itself are left alone.

export type SwipeAction = "next-tab" | "previous-tab" | "back"

const MIN_DISTANCE = 60
const MAX_MS = 700
const EDGE = 32
/** horizontal must clearly dominate, or it's a scroll */
const DOMINANCE = 1.6

export function swipeAction(g: {
  dx: number
  dy: number
  ms: number
  startX: number
  atTabRoot: boolean
}): SwipeAction | null {
  if (g.ms > MAX_MS) return null
  if (Math.abs(g.dx) < MIN_DISTANCE) return null
  if (Math.abs(g.dx) < Math.abs(g.dy) * DOMINANCE) return null
  if (!g.atTabRoot) return g.dx > 0 && g.startX <= EDGE ? "back" : null
  return g.dx < 0 ? "next-tab" : "previous-tab"
}

const OPT_OUT =
  'input, textarea, select, [contenteditable="true"], [role="slider"], [role="dialog"], [data-no-swipe], .touch-none'

/** Whether a touch starting on `target` may become a navigation swipe. */
export function canStartSwipe(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest(OPT_OUT)) return false
  // anything that scrolls sideways (chip rows, photo strips, wide tables) keeps its gesture
  for (let el: Element | null = target; el; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflow = getComputedStyle(el).overflowX
      if (overflow === "auto" || overflow === "scroll") return false
    }
  }
  return true
}
