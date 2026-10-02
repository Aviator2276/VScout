// The Home grid engine (features/home.md H2, ADR-075): a layout is an ordered list of sized
// widgets; positions are computed, never stored. iOS-style flow: each item takes the first spot at
// or after the previous item's top-left cell, so reading order always equals list order.
import type { WidgetSizes } from "@/types/widget"

export interface GridItem {
  id: string
  widget: string
  w: number
  h: number
  config?: Record<string, unknown>
}

export interface Placed extends GridItem {
  x: number
  y: number
}

export const BREAKPOINTS = ["compact", "regular", "wide"] as const
export type Breakpoint = (typeof BREAKPOINTS)[number]
export const COLUMNS: Record<Breakpoint, number> = {
  compact: 4,
  regular: 6,
  wide: 8,
}
export const GAP: Record<Breakpoint, number> = {
  compact: 12,
  regular: 16,
  wide: 16,
}
export const MAX_GRID_WIDTH = 1024

/** The breakpoint for a grid container width (not the viewport). */
export function breakpointFor(width: number): Breakpoint {
  if (width < 520) return "compact"
  if (width < 840) return "regular"
  return "wide"
}

/** Square cells: (width − gaps) / columns. */
export function cellSize(width: number, bp: Breakpoint): number {
  const cols = COLUMNS[bp]
  return (Math.min(width, MAX_GRID_WIDTH) - GAP[bp] * (cols - 1)) / cols
}

export function flow(
  items: ReadonlyArray<GridItem>,
  cols: number
): Array<Placed> {
  const taken = new Set<string>()
  const free = (x: number, y: number, w: number, h: number) => {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        if (taken.has(`${x + dx},${y + dy}`)) return false
    return true
  }
  const out: Array<Placed> = []
  let cursorY = 0
  let cursorX = 0
  for (const item of items) {
    const w = Math.min(item.w, cols)
    let placed: Placed | null = null
    for (let y = cursorY; placed === null; y++) {
      for (let x = y === cursorY ? cursorX : 0; x + w <= cols; x++) {
        if (free(x, y, w, item.h)) {
          placed = { ...item, w, x, y }
          break
        }
      }
    }
    for (let dy = 0; dy < placed.h; dy++)
      for (let dx = 0; dx < placed.w; dx++)
        taken.add(`${placed.x + dx},${placed.y + dy}`)
    out.push(placed)
    cursorY = placed.y
    cursorX = placed.x
  }
  return out
}

export function allowedSizes(
  sizes: WidgetSizes,
  cols: number
): Array<readonly [number, number]> {
  if (sizes.kind === "fixed") return sizes.sizes.filter(([w]) => w <= cols)
  const out: Array<readonly [number, number]> = []
  for (let w = sizes.minW; w <= Math.min(sizes.maxW, cols); w++)
    for (let h = sizes.minH; h <= sizes.maxH; h++) out.push([w, h])
  return out
}

/** The nearest allowed size that fits (Manhattan distance in cells; ties → smaller area). */
export function snapSize(
  sizes: WidgetSizes,
  w: number,
  h: number,
  cols: number
): readonly [number, number] {
  const options = allowedSizes(sizes, cols)
  if (options.length === 0) {
    // nothing fits: the narrowest allowed size, clamped to the columns
    const all = allowedSizes(sizes, 99)
    const first = [...all].sort((a, b) => a[0] - b[0])[0] ?? [
      Math.min(w, cols),
      h,
    ]
    return [Math.min(first[0], cols), first[1]]
  }
  return (
    [...options].sort(
      (a, b) =>
        Math.abs(a[0] - w) +
          Math.abs(a[1] - h) -
          (Math.abs(b[0] - w) + Math.abs(b[1] - h)) || a[0] * a[1] - b[0] * b[1]
    )[0] ?? [w, h]
  )
}

export function move<TItem>(
  items: ReadonlyArray<TItem>,
  from: number,
  to: number
): Array<TItem> {
  const out = [...items]
  const [it] = out.splice(from, 1)
  if (it === undefined) return out
  out.splice(Math.max(0, Math.min(to, out.length)), 0, it)
  return out
}

/** Repairs a stored list on read (H6 rule 1): drop duplicate ids, snap sizes to what's allowed. */
export function normalize(
  items: ReadonlyArray<GridItem>,
  metaOf: (widget: string) => { sizes: WidgetSizes } | undefined
): Array<GridItem> {
  const seen = new Set<string>()
  const out: Array<GridItem> = []
  for (const it of items) {
    if (seen.has(it.id)) continue
    seen.add(it.id)
    const meta = metaOf(it.widget)
    // unknown widgets (a newer app) keep their size
    const [w, h] = meta ? snapSize(meta.sizes, it.w, it.h, 8) : [it.w, it.h]
    out.push({ ...it, w, h })
  }
  return out
}

/**
 * The list for a breakpoint: stored, or derived from the nearest stored list by column count
 * (ties toward the smaller). Derived lists are never written (H2 "How one layout works").
 */
export function listFor(
  custom: Partial<Record<Breakpoint, ReadonlyArray<GridItem>>>,
  bp: Breakpoint
): { items: ReadonlyArray<GridItem>; stored: boolean } | null {
  const own = custom[bp]
  if (own) return { items: own, stored: true }
  const stored = BREAKPOINTS.filter((b) => custom[b] !== undefined)
  if (stored.length === 0) return null
  const nearest = [...stored].sort(
    (a, b) =>
      Math.abs(COLUMNS[a] - COLUMNS[bp]) - Math.abs(COLUMNS[b] - COLUMNS[bp]) ||
      COLUMNS[a] - COLUMNS[b]
  )[0]
  return nearest ? { items: custom[nearest] ?? [], stored: false } : null
}

/** H6 rule 3: every stored list holds the same ids (missing appended, extra dropped). */
export function alignLists(
  custom: Partial<Record<Breakpoint, ReadonlyArray<GridItem>>>
): Partial<Record<Breakpoint, Array<GridItem>>> {
  const stored = BREAKPOINTS.filter((b) => custom[b] !== undefined)
  const smallest = stored[0]
  if (!smallest) return {}
  const canonical = custom[smallest] ?? []
  const ids = new Set(canonical.map((i) => i.id))
  const out: Partial<Record<Breakpoint, Array<GridItem>>> = {}
  for (const b of stored) {
    const list = (custom[b] ?? []).filter((i) => ids.has(i.id))
    const have = new Set(list.map((i) => i.id))
    for (const i of canonical) if (!have.has(i.id)) list.push(i)
    // rule 2: widget and config follow the smallest stored list
    out[b] = list.map((i) => {
      const c = canonical.find((x) => x.id === i.id)
      return c
        ? { ...i, widget: c.widget, ...(c.config ? { config: c.config } : {}) }
        : i
    })
  }
  return out
}
