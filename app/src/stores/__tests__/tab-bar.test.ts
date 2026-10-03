import { describe, expect, it } from "vitest"
import { scrollStep, tabBarStore } from "../tab-bar"

describe("tab bar visibility (FX-11)", () => {
  it("hides while an immersive page holds it, until every hold is released", () => {
    let calls = 0
    const off = tabBarStore.subscribe(() => calls++)
    const a = tabBarStore.hold()
    const b = tabBarStore.hold()
    expect(tabBarStore.hidden()).toBe(true)
    expect(tabBarStore.reason()).toBe("page")
    a()
    a()
    expect(tabBarStore.hidden()).toBe(true)
    b()
    expect(tabBarStore.hidden()).toBe(false)
    expect(calls).toBe(4)
    off()
  })

  it("scrolling down hides it, scrolling up or the top shows it, jitter changes nothing", () => {
    let s = { anchorY: 0, away: false }
    s = scrollStep(s.anchorY, 300, s.away)
    expect(s.away).toBe(true)
    s = scrollStep(s.anchorY, 295, s.away)
    expect(s.away).toBe(true)
    s = scrollStep(s.anchorY, 280, s.away)
    expect(s.away).toBe(false)
    s = scrollStep(s.anchorY, 286, s.away)
    expect(s.away).toBe(false)
    s = scrollStep(s.anchorY, 400, s.away)
    expect(s.away).toBe(true)
    s = scrollStep(s.anchorY, 40, s.away)
    expect(s.away).toBe(false)
  })

  it("slow scrolling still adds up past the threshold", () => {
    let s = { anchorY: 100, away: false }
    for (const y of [104, 108, 112, 116]) s = scrollStep(s.anchorY, y, s.away)
    expect(s.away).toBe(true)
  })
})
