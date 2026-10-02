import { describe, expect, it } from "vitest"
import { createOnlineStore } from "../connectivity"
import { createTabMemory, isTabRoot, tabForPath } from "../tab-memory"

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
