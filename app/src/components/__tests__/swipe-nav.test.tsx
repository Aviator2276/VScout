import { describe, expect, it } from "vitest"
import { canStartSwipe, swipeAction } from "../layout/swipe-nav"

const g = (o: Partial<Parameters<typeof swipeAction>[0]>) =>
  swipeAction({ dx: 0, dy: 0, ms: 200, startX: 150, atTabRoot: true, ...o })

describe("swipe navigation (FX-13)", () => {
  it("on a tab root, left goes to the next tab and right to the previous", () => {
    expect(g({ dx: -120 })).toBe("next-tab")
    expect(g({ dx: 120 })).toBe("previous-tab")
  })

  it("on a pushed page, only a swipe right from the left edge goes back", () => {
    expect(g({ dx: 120, startX: 10, atTabRoot: false })).toBe("back")
    expect(g({ dx: 120, startX: 150, atTabRoot: false })).toBeNull()
    expect(g({ dx: -120, startX: 10, atTabRoot: false })).toBeNull()
  })

  it("ignores short, slow and mostly vertical moves", () => {
    expect(g({ dx: -40 })).toBeNull()
    expect(g({ dx: -120, ms: 1200 })).toBeNull()
    expect(g({ dx: -120, dy: 100 })).toBeNull()
  })

  it("leaves fields, sliders, dialogs and opted-out areas alone", () => {
    document.body.innerHTML = `
      <main><p id="text">x</p><input id="field" />
      <div data-no-swipe><span id="grid">w</span></div>
      <div role="dialog"><span id="sheet">s</span></div></main>`
    const el = (id: string) => document.getElementById(id)
    expect(canStartSwipe(el("text"))).toBe(true)
    expect(canStartSwipe(el("field"))).toBe(false)
    expect(canStartSwipe(el("grid"))).toBe(false)
    expect(canStartSwipe(el("sheet"))).toBe(false)
    expect(canStartSwipe(null)).toBe(false)
  })
})
