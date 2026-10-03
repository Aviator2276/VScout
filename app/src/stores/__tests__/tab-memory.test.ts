import { describe, expect, it } from "vitest"
import { createOnlineStore } from "../connectivity"
import {
  createTabMemory,
  isTabRoot,
  navTransitionTypes,
  tabForPath,
} from "../tab-memory"

class MemoryStorage {
  data = new Map<string, string>()
  failWrites = false
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error("quota")
    this.data.set(k, v)
  }
  removeItem(k: string) {
    if (this.failWrites) throw new Error("quota")
    this.data.delete(k)
  }
}
const storage = () => new MemoryStorage() as unknown as Storage & MemoryStorage

describe("tab memory (routing-auth §9)", () => {
  it("maps paths to tabs: settings belongs to Home, scouting to none", () => {
    expect(tabForPath("/")).toBe("home")
    expect(tabForPath("/settings/admin/users")).toBe("home")
    expect(tabForPath("/matches/2026casj_qm1")).toBe("matches")
    expect(tabForPath("/teams")).toBe("teams")
    expect(tabForPath("/scout/picklists")).toBe("scout")
    expect(tabForPath("/scouting/match/x/1")).toBeNull()
    expect(isTabRoot("/teams/")).toBe(true)
    expect(isTabRoot("/")).toBe(true)
    expect(isTabRoot("/teams/254")).toBe(false)
  })

  it("returns each tab to where you left it, search included", () => {
    const m = createTabMemory(storage())
    expect(m.hrefFor("teams")).toBe("/teams")
    m.remember("/teams/254", "/teams/254?view=pit")
    m.remember("/teams/254", "/teams/254?view=pit")
    m.remember("/scouting/match/x/1", "/scouting/match/x/1")
    expect(m.hrefFor("teams")).toBe("/teams/254?view=pit")
    expect(m.rootFor("teams")).toBe("/teams")
    m.remember("/teams", "/teams?sort=epa")
    expect(m.rootFor("teams")).toBe("/teams?sort=epa")
    expect(m.rootFor("matches")).toBe("/matches")
  })

  it("survives a reload through sessionStorage, and storage failures", () => {
    const s = storage()
    createTabMemory(s).remember("/matches/qm1", "/matches/qm1")
    expect(createTabMemory(s).hrefFor("matches")).toBe("/matches/qm1")
    s.data.set("vscout.tabs", "{not json")
    expect(createTabMemory(s).hrefFor("matches")).toBe("/matches")
    s.failWrites = true
    const m = createTabMemory(s)
    m.remember("/teams/1", "/teams/1")
    expect(m.hrefFor("teams")).toBe("/teams/1")
    m.reset()
    expect(m.hrefFor("teams")).toBe("/teams")
    expect(createTabMemory().hrefFor("scout")).toBe("/scout")
  })
})

describe("per-tab back stacks (FX-10)", () => {
  it("Back stays in the tab: another tab's pages never come back", () => {
    const m = createTabMemory(storage())
    m.remember("/scout", "/scout")
    m.remember("/scout/alliance-selection", "/scout/alliance-selection")
    m.remember("/teams", "/teams")
    m.remember("/teams/254", "/teams/254")
    // back on the Scout tab, where we left it
    m.remember("/scout/alliance-selection", "/scout/alliance-selection")
    expect(m.backFor("/scout/alliance-selection")).toBe("/scout")
    expect(m.backFor("/teams/254")).toBe("/teams")
  })

  it("pops when you go back, and a tab root resets its stack", () => {
    const m = createTabMemory(storage())
    m.remember("/", "/")
    m.remember("/settings", "/settings")
    m.remember("/settings/admin", "/settings/admin")
    m.remember("/settings/admin/users", "/settings/admin/users")
    expect(m.backFor("/settings/admin/users")).toBe("/settings/admin")
    m.remember("/settings/admin", "/settings/admin")
    expect(m.backFor("/settings/admin")).toBe("/settings")
    m.remember("/settings", "/settings")
    expect(m.backFor("/settings")).toBe("/")
    m.remember("/", "/")
    expect(m.backFor("/")).toBeNull()
  })

  it("Back right after a push, before the new page is remembered, returns to the last page", () => {
    const m = createTabMemory(storage())
    m.remember("/settings", "/settings")
    m.remember("/settings/admin", "/settings/admin")
    // /settings/admin/event rendered, but its navigation hasn't been remembered yet
    expect(m.backFor("/settings/admin/event")).toBe("/settings/admin")
  })

  it("keeps the search a page was left with, and knows nothing on a cold deep link", () => {
    const m = createTabMemory(storage())
    m.remember("/teams", "/teams?sort=epa")
    m.remember("/teams/254", "/teams/254")
    expect(m.backFor("/teams/254")).toBe("/teams?sort=epa")
    const cold = createTabMemory(storage())
    cold.remember("/matches/qm9", "/matches/qm9")
    expect(cold.backFor("/matches/qm9")).toBeNull()
    expect(cold.backFor("/scouting/match/x/1")).toBeNull()
  })

  it("Messages is a tab of its own", () => {
    expect(tabForPath("/messages")).toBe("messages")
    expect(tabForPath("/messages/dm:a:b")).toBe("messages")
    expect(isTabRoot("/messages")).toBe(true)
  })

  it("survives a reload, and reads the old one-href-per-tab format", () => {
    const s = storage()
    const m = createTabMemory(s)
    m.remember("/teams", "/teams")
    m.remember("/teams/1", "/teams/1")
    expect(createTabMemory(s).backFor("/teams/1")).toBe("/teams")
    s.data.set("vscout.tabs", JSON.stringify({ matches: "/matches/qm1" }))
    expect(createTabMemory(s).hrefFor("matches")).toBe("/matches/qm1")
  })
})

describe("page transition direction (FX-13)", () => {
  const at = (pathname: string) => ({ pathname })
  const setup = (...visited: Array<string>) => {
    const m = createTabMemory(storage())
    for (const p of visited) m.remember(p, p)
    return m
  }

  it("pushing a page slides forward, Back slides back", () => {
    const m = setup("/teams", "/teams/254")
    expect(navTransitionTypes(m, at("/teams"), at("/teams/254"))).toEqual([
      "nav-forward",
    ])
    expect(navTransitionTypes(m, at("/teams/254"), at("/teams"))).toEqual([
      "nav-back",
    ])
  })

  it("Back to a page deeper in the stack is still back, a sibling is forward", () => {
    const m = setup(
      "/",
      "/settings",
      "/settings/admin",
      "/settings/admin/users"
    )
    expect(
      navTransitionTypes(m, at("/settings/admin/users"), at("/settings/admin"))
    ).toEqual(["nav-back"])
    expect(navTransitionTypes(m, at("/teams/254"), at("/teams/1678"))).toEqual([
      "nav-forward",
    ])
  })

  it("knows the direction even when the destination was remembered first", () => {
    const m = setup("/teams", "/teams/254", "/teams/254/x")
    m.remember("/teams/254", "/teams/254")
    expect(navTransitionTypes(m, at("/teams/254/x"), at("/teams/254"))).toEqual(
      ["nav-back"]
    )
    m.remember("/teams/254/y", "/teams/254/y")
    expect(navTransitionTypes(m, at("/teams/254"), at("/teams/254/y"))).toEqual(
      ["nav-forward"]
    )
  })

  it("switching tabs slides in tab order", () => {
    const m = setup()
    expect(navTransitionTypes(m, at("/"), at("/teams"))).toEqual([
      "tab-forward",
    ])
    expect(
      navTransitionTypes(m, at("/scout/picklists"), at("/messages"))
    ).toEqual(["tab-back"])
  })

  it("scouting forms push over the tabs and pop back to them", () => {
    const m = setup("/scout")
    expect(
      navTransitionTypes(m, at("/scout"), at("/scouting/match/x/254"))
    ).toEqual(["nav-forward"])
    expect(
      navTransitionTypes(m, at("/scouting/match/x/254"), at("/scout"))
    ).toEqual(["nav-back"])
  })

  it("no animation for the first load, search-only changes, or sign-in screens", () => {
    const m = setup()
    expect(navTransitionTypes(m, undefined, at("/"))).toBe(false)
    expect(navTransitionTypes(m, at("/teams"), at("/teams"))).toBe(false)
    expect(navTransitionTypes(m, at("/login"), at("/"))).toBe(false)
    expect(navTransitionTypes(m, at("/onboarding"), at("/"))).toBe(false)
  })
})

describe("online store", () => {
  it("follows online and offline events", () => {
    const target = new EventTarget() as unknown as Window
    let online = true
    const store = createOnlineStore(target, () => online)
    let calls = 0
    const off = store.subscribe(() => calls++)
    online = false
    target.dispatchEvent(new Event("offline"))
    expect(store.getSnapshot()).toBe(false)
    expect(store.getServerSnapshot()).toBe(true)
    off()
    target.dispatchEvent(new Event("online"))
    expect(calls).toBe(1)
    createOnlineStore(undefined, () => true).subscribe(() => undefined)()
  })
})
