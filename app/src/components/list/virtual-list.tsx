// A long list that scrolls with the page (ui-design-system §8, ui-patterns §3: virtualize over 50
// rows). Rows and section headers are one flat array; the current section header stays pinned
// under the nav bar. Only the visible window (+ overscan) is in the DOM. Rows between headers sit on
// one rounded card (rows use bg-card and a bottom hairline; the card's last row drops it).
import {
  defaultRangeExtractor,
  useWindowVirtualizer,
} from "@tanstack/react-virtual"
import type { Range } from "@tanstack/react-virtual"
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ReactNode, Ref } from "react"
import { cn } from "@/lib/utils"

export interface VirtualItem {
  id: string
  /** headers pin while their section is on screen */
  sticky?: boolean
  /** not a row: sits outside the rounded cards and splits them (a "Now" divider) */
  plain?: boolean
}

/** Scroll commands the screen can issue (Jump to Now). */
export interface VirtualListHandle {
  scrollToIndex: (index: number, behavior?: "auto" | "smooth") => void
}

export interface VirtualListProps<TItem extends VirtualItem> {
  /** the list's accessible name */
  label: string
  items: ReadonlyArray<TItem>
  estimateSize: (item: TItem) => number
  renderItem: (item: TItem) => ReactNode
  /** the visible index range changed (not counting overscan) */
  onVisibleRange?: (first: number, last: number) => void
  handleRef?: Ref<VirtualListHandle>
  /** room above a scrolled-to item: nav bar + a pinned header */
  scrollPaddingStart?: number
  /** for scroll restoration (routing-auth §9) */
  restorationId?: string
}

const STICKY_TOP = "calc(var(--k-safe-area-top, 0px) + 2.75rem)"

export function VirtualList<TItem extends VirtualItem>({
  label,
  items,
  estimateSize,
  renderItem,
  onVisibleRange,
  handleRef,
  scrollPaddingStart = 96,
  restorationId,
}: VirtualListProps<TItem>) {
  const listRef = useRef<HTMLDivElement>(null)
  const [margin, setMargin] = useState(0)
  useLayoutEffect(() => {
    const el = listRef.current
    if (el) setMargin(el.getBoundingClientRect().top + window.scrollY)
  }, [])

  const stickyIndexes = useMemo(
    () => items.flatMap((it, i) => (it.sticky ? [i] : [])),
    [items]
  )
  const stickyFor = useCallback(
    (start: number) =>
      [...stickyIndexes].reverse().find((i) => start >= i) ?? -1,
    [stickyIndexes]
  )
  const rangeExtractor = useCallback(
    (range: Range) => {
      const sticky = stickyFor(range.startIndex)
      const next = new Set(defaultRangeExtractor(range))
      if (sticky >= 0) next.add(sticky)
      return [...next].sort((a, b) => a - b)
    },
    [stickyFor]
  )

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: (i) => {
      const it = items[i]
      return it ? estimateSize(it) : 44
    },
    getItemKey: (i) => items[i]?.id ?? i,
    overscan: 8,
    scrollMargin: margin,
    scrollPaddingStart,
    rangeExtractor,
  })

  useImperativeHandle(
    handleRef,
    () => ({
      scrollToIndex: (index, behavior = "auto") =>
        virtualizer.scrollToIndex(index, { align: "start", behavior }),
    }),
    [virtualizer]
  )

  const first = virtualizer.range?.startIndex ?? 0
  const activeSticky = stickyFor(first)
  const last = virtualizer.range?.endIndex ?? 0
  useEffect(() => {
    onVisibleRange?.(first, last)
  }, [first, last, onVisibleRange])

  return (
    <div
      ref={listRef}
      role="list"
      aria-label={label}
      data-scroll-restoration-id={restorationId}
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((v) => {
        const item = items[v.index]
        if (!item) return null
        const pinned = item.sticky && activeSticky === v.index
        // rows between headers form one rounded card, like an iOS inset-grouped list (owner)
        const prev = items[v.index - 1]
        const next = items[v.index + 1]
        const isRow = (it: TItem | undefined) =>
          it !== undefined && it.sticky !== true && it.plain !== true
        const groupStart = isRow(item) && !isRow(prev)
        const groupEnd = isRow(item) && !isRow(next)
        return (
          <div
            key={v.key}
            data-index={v.index}
            ref={virtualizer.measureElement}
            data-group-end={groupEnd || undefined}
            className={cn(
              // a pinned header floats over the rows on glass, not a solid band
              pinned && "z-10 rounded-xl glass-bar",
              isRow(item) && "overflow-hidden bg-card",
              groupStart && "rounded-t-2xl",
              groupEnd && "mb-3 rounded-b-2xl shadow-xs"
            )}
            style={
              pinned
                ? { position: "sticky", top: STICKY_TOP }
                : {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)`,
                  }
            }
            role="none"
          >
            {renderItem(item)}
          </div>
        )
      })}
    </div>
  )
}
