import fc from "fast-check"
import { describe, expect, it } from "vitest"
import type { WidgetSizes } from "@/types/widget"
import {
  alignLists,
  breakpointFor,
  cellSize,
  flow,
  listFor,
  move,
  normalize,
  snapSize,
} from "../grid-engine"
import type { GridItem } from "../grid-engine"

const item = (id: string, w: number, h: number): GridItem => ({
  id,
  widget: id,
  w,
  h,
})

describe("geometry (home.md criterion 6)", () => {
  it("4 / 6 / 8 columns by container width, square cells, max 1024", () => {
    expect(breakpointFor(358)).toBe("compact")
    expect(breakpointFor(694)).toBe("regular")
    expect(breakpointFor(1132)).toBe("wide")
    expect(cellSize(358, "compact")).toBeCloseTo((358 - 36) / 4)
    expect(cellSize(1132, "wide")).toBeCloseTo((1024 - 112) / 8)
  })
})

describe("flow (criterion 10a)", () => {
  it("two 2×2 share a row, then a 4×2 fills the next", () => {
    const p = flow([item("A", 2, 2), item("B", 2, 2), item("C", 4, 2)], 4)
    expect(p.map((x) => [x.id, x.x, x.y])).toEqual([
      ["A", 0, 0],
      ["B", 2, 0],
      ["C", 0, 2],
    ])
  })

  it("no backfill: a 4×2 after a lone 2×2 starts a new row, the gap stays", () => {
    const p = flow([item("A", 2, 2), item("C", 4, 2), item("B", 2, 2)], 4)
    expect(p.map((x) => [x.id, x.x, x.y])).toEqual([
      ["A", 0, 0],
      ["C", 0, 2],
      ["B", 0, 4],
    ])
  })

  const arbItems = fc.array(
    fc.record({
      w: fc.integer({ min: 1, max: 8 }),
      h: fc.integer({ min: 1, max: 6 }),
    }),
    { maxLength: 20 }
  )

  it("never overlaps, always fits, and keeps reading order = list order (property)", () => {
    fc.assert(
      fc.property(arbItems, fc.constantFrom(4, 6, 8), (sizes, cols) => {
        const items = sizes.map((s, i) => item(`w${i}`, s.w, s.h))
        const placed = flow(items, cols)
        const cells = new Set<string>()
        for (const p of placed) {
          expect(p.x + p.w).toBeLessThanOrEqual(cols)
          for (let dy = 0; dy < p.h; dy++)
            for (let dx = 0; dx < p.w; dx++) {
              const k = `${p.x + dx},${p.y + dy}`
              expect(cells.has(k)).toBe(false)
              cells.add(k)
            }
        }
        for (let i = 1; i < placed.length; i++) {
          const a = placed[i - 1]
          const b = placed[i]
          if (!a || !b) continue
          expect(b.y > a.y || (b.y === a.y && b.x > a.x)).toBe(true)
        }
        expect(placed.map((p) => p.id)).toEqual(items.map((i) => i.id))
      })
    )
  })

  it("move keeps the id set (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.nat(),
        fc.nat(),
        (n, a, b) => {
          const items = Array.from({ length: n }, (_, i) => item(`w${i}`, 1, 1))
          const out = move(items, a % n, b % n)
          expect(new Set(out.map((i) => i.id))).toEqual(
            new Set(items.map((i) => i.id))
          )
        }
      )
    )
  })
})

describe("sizes (criteria 13–15, 22)", () => {
  const range: WidgetSizes = {
    kind: "range",
    minW: 2,
    maxW: 8,
    minH: 2,
    maxH: 6,
  }
  const fixed: WidgetSizes = {
    kind: "fixed",
    sizes: [
      [2, 2],
      [4, 2],
      [4, 3],
    ],
  }

  it("range widgets step one cell at a time", () => {
    expect(snapSize(range, 3, 3, 4)).toEqual([3, 3])
  })

  it("fixed widgets jump between their sizes: 3×2 isn't allowed, 2×2 is nearer by area", () => {
    expect(snapSize(fixed, 3, 2, 4)).toEqual([2, 2])
  })

  it("never wider than the columns", () => {
    const wide: WidgetSizes = {
      kind: "fixed",
      sizes: [
        [2, 2],
        [4, 2],
        [4, 4],
        [8, 4],
      ],
    }
    expect(snapSize(wide, 8, 4, 4)).toEqual([4, 4])
  })

  it("normalize drops duplicates and snaps sizes; unknown widgets keep theirs", () => {
    const out = normalize(
      [
        item("a", 3, 2),
        item("a", 2, 2),
        { id: "x", widget: "futureThing", w: 5, h: 5 },
      ],
      (w) => (w === "a" ? { sizes: fixed } : undefined)
    )
    expect(out).toEqual([
      { id: "a", widget: "a", w: 2, h: 2 },
      { id: "x", widget: "futureThing", w: 5, h: 5 },
    ])
  })
})

describe("one layout across screen sizes (criteria 8–9)", () => {
  it("a breakpoint without a list derives from the nearest stored one", () => {
    const compact = [item("a", 4, 2), item("b", 4, 2)]
    expect(listFor({ compact }, "wide")).toEqual({
      items: compact,
      stored: false,
    })
    expect(listFor({ compact }, "compact")).toEqual({
      items: compact,
      stored: true,
    })
    expect(listFor({}, "compact")).toBeNull()
  })

  it("stored lists keep the same id set and the smallest list's config", () => {
    const out = alignLists({
      compact: [
        item("a", 2, 2),
        { ...item("b", 2, 2), config: { channel: "x" } },
      ],
      wide: [item("b", 4, 2), item("z", 2, 2)],
    })
    expect(out.wide?.map((i) => i.id)).toEqual(["b", "a"])
    expect(out.wide?.[0]?.config).toEqual({ channel: "x" })
  })
})
