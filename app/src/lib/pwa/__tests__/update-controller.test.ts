import { afterEach, describe, expect, it, vi } from "vitest"
import { createUpdateController } from "../update-controller"
import type { UpdatePort, UpdatePortHandlers } from "../update-controller"
import { createUpdateGuard, isScoutingPath } from "../update-guard"

afterEach(() => vi.useRealTimers())

class FakePort implements UpdatePort {
  handlers: UpdatePortHandlers | null = null
  waiting: string | null = null
  controlled = true
  skips = 0
  updates = 0
  failUpdate = false
  register(h: UpdatePortHandlers) {
    this.handlers = h
    return Promise.resolve()
  }
  update() {
    this.updates++
    return this.failUpdate
      ? Promise.reject(new Error("net"))
      : Promise.resolve()
  }
  hasWaiting = () => this.waiting !== null
  waitingVersion = () => Promise.resolve(this.waiting)
  skipWaiting = () => {
    this.skips++
  }
  isControlled = () => this.controlled
}

class MemorySession {
  data = new Map<string, string>()
  getItem = (k: string) => this.data.get(k) ?? null
  setItem = (k: string, v: string) => void this.data.set(k, v)
  removeItem = (k: string) => void this.data.delete(k)
}

function setup(
  o: { remote?: string | null; path?: string; online?: boolean } = {}
) {
  const port = new FakePort()
  const guard = createUpdateGuard()
  const reloads: Array<string | undefined> = []
  let now = 1_000_000
  let path = o.path ?? "/"
  let remote: string | null = o.remote ?? "2.0.0-alpha.0"
  let online = o.online ?? true
  const session = new MemorySession()
  const c = createUpdateController({
    port,
    current: "2.0.0-alpha.0",
    guard,
    fetchRemoteVersion: () => Promise.resolve(remote),
    isOnline: () => online,
    isVisible: () => true,
    pathname: () => path,
    reload: (href) => reloads.push(href),
    now: () => now,
    session,
    applyTimeoutMs: 50,
  })
  return {
    c,
    port,
    guard,
    reloads,
    session,
    advance: (ms: number) => (now += ms),
    setPath: (p: string) => (path = p),
    setRemote: (v: string | null) => (remote = v),
    setOnline: (v: boolean) => (online = v),
  }
}

describe("update detection (pwa-offline §6)", () => {
  it("is idle and offline-ready when nothing newer exists", async () => {
    const t = setup()
    await t.c.start()
    await vi.waitFor(() =>
      expect(t.c.state.getSnapshot().lastCheckedAt).toBeDefined()
    )
    expect(t.c.state.getSnapshot()).toMatchObject({
      status: "idle",
      offlineReady: true,
    })
  })

  it("downloads a newer version, then is ready with the waiting SW's version", async () => {
    const t = setup({ remote: "2.0.0-alpha.1" })
    t.port.controlled = false
    await t.c.start()
    await vi.waitFor(() =>
      expect(t.c.state.getSnapshot().status).toBe("downloading")
    )
    expect(t.c.state.getSnapshot()).toMatchObject({
      available: "2.0.0-alpha.1",
      offlineReady: false,
    })
    t.port.handlers?.onInstalling()
    t.port.waiting = "2.0.0-alpha.1"
    t.port.handlers?.onWaiting(false)
    await vi.waitFor(() => expect(t.c.state.getSnapshot().status).toBe("ready"))
    t.port.handlers?.onInstalling()
    expect(t.c.state.getSnapshot().status).toBe("ready")
    t.port.handlers?.onActivated(false)
    expect(t.c.state.getSnapshot().offlineReady).toBe(true)
    expect(await t.c.check("manual")).toBe("available")
  })

  it("throttles automatic checks and skips them offline", async () => {
    const t = setup()
    expect(await t.c.check("visible")).toBe("up-to-date")
    expect(await t.c.check("visible")).toBe("up-to-date")
    expect(t.port.updates).toBe(1)
    t.advance(61_000)
    t.setOnline(false)
    expect(await t.c.check("online")).toBe("offline")
    expect(await t.c.check("manual")).toBe("offline")
  })

  it("a failed check is not an error state", async () => {
    const t = setup()
    t.port.failUpdate = true
    expect(await t.c.check("manual")).toBe("failed")
    expect(t.c.state.getSnapshot().status).toBe("idle")
    t.c.markUnsupported()
    expect(await t.c.check("manual")).toBe("failed")
  })

  it("ignores a malformed version.json", async () => {
    const t = setup({ remote: "not-a-version" })
    expect(await t.c.check("manual")).toBe("up-to-date")
  })
})

describe("applying at a safe moment (pwa-offline §7)", () => {
  async function ready(t: ReturnType<typeof setup>) {
    t.port.waiting = "2.0.0-alpha.1"
    await t.c.check("manual")
    expect(t.c.state.getSnapshot().status).toBe("ready")
  }

  it("applies on a navigation and reloads into the target", async () => {
    const t = setup()
    await t.c.start()
    await vi.waitFor(() =>
      expect(t.c.state.getSnapshot().lastCheckedAt).toBeDefined()
    )
    await ready(t)
    expect(
      t.c.onBeforeNavigate({ pathname: "/teams", href: "/teams?sort=epa" })
    ).toBe(true)
    expect(t.port.skips).toBe(1)
    expect(t.c.state.getSnapshot().status).toBe("applying")
    t.port.handlers?.onControlling(true)
    expect(t.reloads).toEqual(["/teams?sort=epa"])
    expect(t.session.getItem("vscout.updatedFrom")).toBe("2.0.0-alpha.0")
  })

  it("never applies on /scouting, into /scouting, or with a blocker held", async () => {
    const t = setup()
    await ready(t)
    expect(
      t.c.onBeforeNavigate({
        pathname: "/scouting/match/x/1",
        href: "/scouting/match/x/1",
      })
    ).toBe(false)
    t.setPath("/scouting/pit/254")
    expect(t.c.onBeforeNavigate({ pathname: "/teams", href: "/teams" })).toBe(
      false
    )
    t.c.onHidden()
    t.setPath("/teams")
    const release = t.guard.block()
    expect(t.c.isSafeToApply()).toBe(false)
    t.c.onHidden()
    expect(t.port.skips).toBe(0)
    release()
    release()
    t.c.onHidden()
    expect(t.port.skips).toBe(1)
    expect(isScoutingPath("/scouting")).toBe(true)
  })

  it("returns to ready when controlling never arrives, and refuses an apply loop", async () => {
    vi.useFakeTimers()
    const t = setup()
    await ready(t)
    expect(t.c.apply()).toBe(true)
    vi.advanceTimersByTime(60)
    expect(t.c.state.getSnapshot().status).toBe("ready")
    expect(t.c.apply()).toBe(false)
    expect(t.c.state.getSnapshot().status).toBe("error")
    expect(t.c.apply()).toBe(false)
  })

  it("applies a waiting update at a cold start", async () => {
    const t = setup()
    t.port.waiting = "2.0.0-alpha.1"
    await t.c.start()
    t.port.handlers?.onWaiting(true)
    await vi.waitFor(() => expect(t.port.skips).toBe(1))
  })

  it("another tab's update reloads this one when safe, otherwise shows a banner", async () => {
    const t = setup()
    await t.c.start()
    t.port.handlers?.onControlling(true)
    expect(t.reloads).toEqual([undefined])
    t.setPath("/scouting/pit/1")
    t.port.handlers?.onControlling(true)
    expect(t.c.state.getSnapshot().updatedElsewhere).toBe(true)
  })

  it("ignores the first install taking control: no reload (an offline reload is an error page)", async () => {
    const t = setup()
    await t.c.start()
    t.port.handlers?.onControlling(false)
    expect(t.reloads).toEqual([])
    expect(t.c.state.getSnapshot().offlineReady).toBe(true)
  })

  it("reports the version it updated from, once", () => {
    const t = setup()
    t.session.setItem("vscout.updatedFrom", "1.9.0")
    expect(t.c.takeUpdatedFrom()).toBe("1.9.0")
    expect(t.c.takeUpdatedFrom()).toBeNull()
  })
})

describe("minClientVersion (pwa-offline §8)", () => {
  it("forces an update when the server needs a newer client, keeping the highest minimum", async () => {
    const t = setup()
    t.c.setMinClientVersion("2.0.0-alpha.0")
    expect(t.c.state.getSnapshot().forced).toBe(false)
    t.c.setMinClientVersion("bogus")
    t.c.setMinClientVersion("2.1.0")
    expect(t.c.state.getSnapshot()).toMatchObject({
      forced: true,
      minClientVersion: "2.1.0",
    })
    t.c.setMinClientVersion("2.0.5")
    expect(t.c.state.getSnapshot().minClientVersion).toBe("2.1.0")
  })
})
