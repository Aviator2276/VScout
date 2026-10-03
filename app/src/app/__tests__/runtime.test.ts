import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { setupAppRuntime } from "@/testing/app-runtime"
import { TEST_EVENT, wireEnvelope, wireEvent } from "@/testing/factories/wire"
import {
  MOCK_CREDENTIALS,
  MOCK_GUEST_CODE,
  mockBackend,
} from "@/testing/mocks/mock-backend"
import { server } from "@/testing/mocks/server"
import { describeDevice } from "../runtime"

beforeEach(() => mockBackend.reset())

const signIn = (r: ReturnType<typeof setupAppRuntime>["runtime"]) =>
  r.auth.login(MOCK_CREDENTIALS.username, MOCK_CREDENTIALS.password)

describe("session lifecycle (routing-auth §7.2)", () => {
  it("starts sync and MQTT while held, and stops both when released", async () => {
    mockBackend.append("global", "event", wireEnvelope("event", wireEvent()))
    const t = setupAppRuntime()
    await signIn(t.runtime)
    const release = t.runtime.acquireSession()
    await t.runtime.whenSettled()
    await vi.waitFor(async () => expect(await t.db.events.count()).toBe(1))
    await vi.waitFor(() => expect(t.broker.clientIds()).toHaveLength(1))

    release()
    await t.runtime.whenSettled()
    expect(t.broker.clientIds()).toHaveLength(0)
  })

  it("survives a StrictMode remount: one start, no stray stop", async () => {
    const t = setupAppRuntime()
    await signIn(t.runtime)
    const first = t.runtime.acquireSession()
    first()
    const second = t.runtime.acquireSession()
    await t.runtime.whenSettled()
    await vi.waitFor(() => expect(t.broker.clientIds()).toHaveLength(1))
    expect(t.broker.created).toHaveLength(1)
    second()
    await t.runtime.whenSettled()
  })

  it("a failing start is logged and the next hold retries", async () => {
    const t = setupAppRuntime()
    await signIn(t.runtime)
    const spy = vi
      .spyOn(t.db.deviceSettings, "get")
      .mockRejectedValueOnce(new Error("boom"))
    const release = t.runtime.acquireSession()
    await t.runtime.whenSettled()
    expect(t.broker.created).toHaveLength(0)
    release()
    await t.runtime.whenSettled()
    spy.mockRestore()
    const again = t.runtime.acquireSession()
    await t.runtime.whenSettled()
    await vi.waitFor(() => expect(t.broker.created).toHaveLength(1))
    again()
    await t.runtime.whenSettled()
  })

  it("logout ends the session and tells the shell why", async () => {
    const t = setupAppRuntime()
    await signIn(t.runtime)
    const ended = vi.fn()
    t.runtime.onSessionEnded(ended)
    await t.runtime.setActiveEvent(TEST_EVENT)
    expect(await t.runtime.auth.logout()).toEqual({ ok: true })
    expect(ended).toHaveBeenCalledWith("logout")
    expect(t.runtime.activeEventKey.getSnapshot()).toBeNull()
  })

  it("waits for the signed-in pages to leave before wiping the database", async () => {
    const t = setupAppRuntime()
    await signIn(t.runtime)
    const order: Array<string> = []
    t.runtime.onSessionEnded(async () => {
      order.push(`leaving, db open: ${String(t.db.isOpen())}`)
      await new Promise((r) => setTimeout(r, 10))
      order.push("left")
    })
    const realDelete = t.db.delete.bind(t.db)
    vi.spyOn(t.db, "delete").mockImplementation((opts) => {
      order.push("wipe")
      return opts ? realDelete(opts) : realDelete()
    })
    await t.runtime.auth.logout()
    expect(order).toEqual(["leaving, db open: true", "left", "wipe"])
  })

  it("another tab's logout ends this tab's session too", async () => {
    const t = setupAppRuntime()
    await signIn(t.runtime)
    const ended = vi.fn()
    const off = t.runtime.onSessionEnded(ended)
    t.channel.receive({ type: "logout", reason: "logout" })
    await vi.waitFor(() => expect(ended).toHaveBeenCalledWith("logout"))
    off()
    t.channel.receive({ type: "logout" })
    t.channel.receive({ type: "session" })
    await t.runtime.whenSettled()
    expect(ended).toHaveBeenCalledTimes(1)
  })

  it("asks once for persistent storage after sign-in", async () => {
    const persist = vi.fn(() => Promise.resolve(true))
    const t = setupAppRuntime({ persistStorage: persist })
    await signIn(t.runtime)
    await t.runtime.afterSignIn()
    await t.runtime.afterSignIn()
    expect(persist).toHaveBeenCalledOnce()
    // without the API it does nothing
    await setupAppRuntime().runtime.afterSignIn()
  })
})

describe("active event (ADR-021, ADR-056, ADR-073)", () => {
  it("is null until picked, then remembered on the device", async () => {
    const t = setupAppRuntime()
    await signIn(t.runtime)
    expect(await t.runtime.loadActiveEvent()).toBeNull()
    await t.runtime.setActiveEvent(TEST_EVENT)
    expect(await t.runtime.loadActiveEvent()).toEqual({
      key: TEST_EVENT,
      name: TEST_EVENT,
      year: 2026,
    })
    await t.db.events.put({
      key: TEST_EVENT,
      id: TEST_EVENT,
      name: "Silicon Valley Regional",
      year: 2026,
    } as never)
    expect(await t.runtime.loadActiveEvent()).toMatchObject({
      name: "Silicon Valley Regional",
    })
    // picking the same event again doesn't force a resync
    await t.runtime.setActiveEvent(TEST_EVENT)
  })

  it("a wiped device opens on the synced lastActiveEventKey", async () => {
    const t = setupAppRuntime()
    const session = await signIn(t.runtime)
    await t.db.userSettings.put({
      userId: session.userId,
      lastActiveEventKey: "2026cafr",
    } as never)
    expect(await t.runtime.loadActiveEvent()).toMatchObject({
      key: "2026cafr",
    })
    expect((await t.db.deviceSettings.get("device"))?.activeEventKey).toBe(
      "2026cafr"
    )
  })

  it("a guest always uses their code's event", async () => {
    const t = setupAppRuntime()
    await t.runtime.auth.loginAsGuest(MOCK_GUEST_CODE)
    expect(await t.runtime.loadActiveEvent()).toMatchObject({
      key: TEST_EVENT,
    })
  })

  it("is null when signed out", async () => {
    const t = setupAppRuntime({ isOnline: () => false })
    expect(await t.runtime.loadActiveEvent()).toBeNull()
  })
})

describe("/meta and the data runtime", () => {
  it("loads capabilities and the minimum client version", async () => {
    const t = setupAppRuntime()
    await t.runtime.loadMeta()
    expect(t.runtime.capabilities.get().guestLogin).toBe(true)
    expect(t.runtime.minClientVersion.getSnapshot()).toBe("2.0.0-alpha.0")
  })

  it("keeps the defaults when /meta fails", async () => {
    server.use(
      http.get("*/api/v1/meta", () =>
        HttpResponse.json({ code: "oops" }, { status: 500 })
      )
    )
    const t = setupAppRuntime()
    await t.runtime.loadMeta()
    expect(t.runtime.capabilities.get().guestLogin).toBe(false)
  })

  it("canSync follows the connection and the session", async () => {
    const t = setupAppRuntime()
    const { dataRuntime } = t.runtime
    const listener = vi.fn()
    const off = dataRuntime.subscribeSync(listener)
    expect(dataRuntime.canSync()).toBe(false)
    await signIn(t.runtime)
    expect(dataRuntime.canSync()).toBe(true)
    t.setOnline(false)
    expect(dataRuntime.canSync()).toBe(false)
    expect(listener).toHaveBeenCalled()
    off()
    dataRuntime.requestSync?.()
    expect(dataRuntime.clockSkewMs?.()).toBe(0)
  })
})

describe("describeDevice", () => {
  it.each([
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Safari/604.1",
      "iPhone · Safari",
    ],
    [
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1",
      "iPad · Safari",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36",
      "Android · Chrome",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/131.0",
      "Mac · Firefox",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36 Edg/130.0",
      "Windows · Edge",
    ],
    ["curl/8.0", "Browser"],
  ])("%s", (ua, expected) => {
    expect(describeDevice(ua)).toBe(expected)
  })
})
