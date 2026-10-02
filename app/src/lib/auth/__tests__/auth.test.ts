import { HttpResponse, http } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { createApiClient } from "@/lib/api/api-client"
import { createHttpTransport } from "@/lib/api/transport/http-transport"
import { createMqttRpcTransport } from "@/lib/api/transport/mqtt-rpc-transport"
import { TransportHealth } from "@/lib/api/transport/select-transport"
import { getKv, setKv } from "@/lib/db/kv"
import { createTestDb, fakeClock, seqIds } from "@/testing/db"
import { API } from "@/testing/engine"
import {
  MOCK_CREDENTIALS,
  MOCK_GUEST_CODE,
  MOCK_USER_ID,
  mockBackend,
} from "@/testing/mocks/mock-backend"
import { server } from "@/testing/mocks/server"
import { createAuthClient, expiryState, LoginError } from "../auth-client"
import { createRefresher } from "../refresh"
import type { BroadcastLike } from "../refresh"
import { createTokenStore } from "../token-store"
import type { Session } from "../types"

beforeEach(() => mockBackend.reset())

function setup(
  o: {
    online?: boolean
    channel?: BroadcastLike
    locks?: Parameters<typeof createRefresher>[0]["locks"]
  } = {}
) {
  const db = createTestDb()
  const clock = fakeClock(Date.UTC(2026, 2, 20, 15, 0))
  const tokens = createTokenStore()
  const api = createApiClient({
    transports: {
      http: createHttpTransport({ baseUrl: API }),
      mqtt: createMqttRpcTransport({
        channel: () => null,
        ids: seqIds("x"),
        enabled: () => false,
      }),
    },
    health: new TransportHealth(),
    mode: () => "http-only",
    clock,
    clientVersion: "2.0.0-alpha.0",
    accessToken: () => tokens.get(),
    refresh: () => Promise.resolve(false),
  })
  const refresher = createRefresher({
    api,
    tokens,
    now: clock.now,
    ...(o.channel ? { channel: o.channel } : {}),
    ...(o.locks ? { locks: o.locks } : {}),
  })
  const events: Array<string> = []
  const auth = createAuthClient({
    db: () => db,
    api,
    tokens,
    refresher,
    clock,
    ids: seqIds("0190eeee"),
    deviceName: () => "Test iPhone (PWA)",
    isOnline: () => o.online ?? true,
    ...(o.channel ? { channel: o.channel } : {}),
    onLoggedOut: (reason) => {
      events.push(`out:${reason}`)
    },
    onRoleChanged: (role) => events.push(`role:${role}`),
  })
  return { db, auth, tokens, clock, events, refresher }
}

describe("login", () => {
  it("writes the session, keeps the token in memory and creates a device id", async () => {
    const { db, auth, tokens } = setup()
    const s = await auth.login(
      MOCK_CREDENTIALS.username,
      MOCK_CREDENTIALS.password
    )
    expect(s).toMatchObject({
      userId: MOCK_USER_ID,
      role: "scouter",
      status: "active",
      eventKey: null,
    })
    expect(await db.session.get("current")).toMatchObject({
      userId: MOCK_USER_ID,
      displayName: "Alex",
    })
    expect(tokens.get()).toBe("test-access-token")
    expect(await getKv(db, "deviceId")).toMatch(/^0190eeee/)
    expect(auth.getSession()).toEqual(s)
  })

  it("maps wrong passwords, guest codes, rate limits and no network to LoginError codes", async () => {
    const { auth } = setup()
    await expect(auth.login("alex", "wrong")).rejects.toMatchObject({
      code: "invalid_credentials",
    })
    await expect(auth.loginAsGuest("ZZZZZZ")).rejects.toMatchObject({
      code: "invalid_guest_code",
    })
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json(
          { status: 429, code: "rate_limited" },
          { status: 429 }
        )
      )
    )
    await expect(auth.login("alex", "x")).rejects.toMatchObject({
      code: "rate_limited",
    })
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.error()))
    await expect(auth.login("alex", "x")).rejects.toBeInstanceOf(LoginError)
    await expect(auth.login("alex", "x")).rejects.toMatchObject({
      code: "offline",
    })
    server.use(
      http.post(`${API}/auth/login`, () => HttpResponse.json({ weird: true }))
    )
    await expect(auth.login("alex", "x")).rejects.toMatchObject({
      code: "unknown",
    })
  })

  it("signs a guest in, scoped to the code's event (ADR-073)", async () => {
    const { auth } = setup()
    const s = await auth.loginAsGuest(MOCK_GUEST_CODE)
    expect(s).toMatchObject({ role: "guest", eventKey: "2026casj" })
  })

  it("starts from an empty database when someone else signs in on this device", async () => {
    const { db, auth, events } = setup()
    await db.session.put({
      id: "current",
      userId: "previous-user",
      username: "p",
      displayName: "P",
      role: "scouter",
      eventKey: null,
      refreshExpiresAt: 0,
      status: "active",
      lastVerifiedAt: 0,
    })
    await db.comments.put({ id: "c1", eventKey: "2026casj" } as never)
    await auth.login(MOCK_CREDENTIALS.username, MOCK_CREDENTIALS.password)
    expect(await db.comments.count()).toBe(0)
    expect(events).toContain("out:switch-user")
  })
})

describe("session loading (guards)", () => {
  it("reads the cached row once, without the network", async () => {
    const { db, auth } = setup({ online: false })
    await db.session.put({
      id: "current",
      userId: "u",
      username: "u",
      displayName: "U",
      role: "admin",
      eventKey: null,
      refreshExpiresAt: 1,
      status: "active",
      lastVerifiedAt: 0,
    })
    const a = await auth.ensureLoaded()
    await db.session.clear()
    expect(await auth.ensureLoaded()).toBe(a)
    auth.invalidate()
    expect(await auth.ensureLoaded()).toBeNull() // offline and no row
  })

  it("recovers the session from the cookie after a cache wipe (mqtt.md §8.1)", async () => {
    const { db, auth } = setup()
    const s = await auth.ensureLoaded()
    expect(s).toMatchObject({ userId: MOCK_USER_ID, status: "active" })
    expect(await db.session.count()).toBe(1)
    // the backend re-binds the device (PV-3)
    expect(await getKv(db, "deviceId")).toBe(
      "01900000-0000-7000-8000-000000008000"
    )
  })

  it("stays signed out when the cookie is gone too", async () => {
    mockBackend.refreshValid = false
    const { auth } = setup()
    expect(await auth.ensureLoaded()).toBeNull()
  })
})

describe("refresh", () => {
  async function signedIn() {
    const ctx = setup()
    await ctx.auth.login(MOCK_CREDENTIALS.username, MOCK_CREDENTIALS.password)
    return ctx
  }

  it("a rejected refresh marks the session needs-reauth; a later success clears it", async () => {
    const { auth } = await signedIn()
    mockBackend.refreshValid = false
    expect(await auth.refresh()).toBe(false)
    expect(auth.getSession()?.status).toBe("needs-reauth")
    mockBackend.refreshValid = true
    expect(await auth.refresh()).toBe(true)
    expect(auth.getSession()?.status).toBe("active")
  })

  it("keeps the session when offline or the server fails", async () => {
    const { auth } = await signedIn()
    server.use(http.post(`${API}/auth/refresh`, () => HttpResponse.error()))
    expect(await auth.refresh()).toBe(false)
    server.use(
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({ status: 503, code: "x" }, { status: 503 })
      )
    )
    expect(await auth.refresh()).toBe(false)
    server.use(
      http.post(`${API}/auth/refresh`, () => HttpResponse.json({ nope: 1 }))
    )
    expect(await auth.refresh()).toBe(false)
    expect(auth.getSession()?.status).toBe("active")
  })

  it("a disabled account (403) wipes the device", async () => {
    const { auth, db, events } = await signedIn()
    server.use(
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json(
          { status: 403, code: "account_disabled" },
          { status: 403 }
        )
      )
    )
    expect(await auth.refresh()).toBe(false)
    expect(auth.getSession()).toBeNull()
    expect(await db.session.count()).toBe(0)
    expect(events).toContain("out:account_disabled")
  })

  it("reports a role change and wipes if the cookie belongs to another user", async () => {
    const { auth, events, db } = await signedIn()
    server.use(
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({
          accessToken: "t",
          accessExpiresAt: "2026-03-20T15:15:00.000Z",
          refreshExpiresAt: "2026-04-20T15:00:00.000Z",
          user: {
            id: MOCK_USER_ID,
            username: "alex",
            displayName: "Alex",
            role: "admin",
          },
        })
      )
    )
    await auth.refresh()
    expect(events).toContain("role:admin")
    server.use(
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({
          accessToken: "t",
          accessExpiresAt: "2026-03-20T15:15:00.000Z",
          refreshExpiresAt: "2026-04-20T15:00:00.000Z",
          user: {
            id: "someone-else",
            username: "z",
            displayName: "Z",
            role: "scouter",
          },
        })
      )
    )
    expect(await auth.refresh()).toBe(false)
    expect(await db.session.count()).toBe(0)
  })

  it("refreshes only when the token is missing or about to expire", async () => {
    const { auth, tokens, clock } = await signedIn()
    let calls = 0
    server.events.on("request:start", ({ request }) => {
      if (request.url.endsWith("/auth/refresh")) calls++
    })
    tokens.set("fresh", clock.now() + 10 * 60_000)
    expect(await auth.refreshIfNeeded()).toBe(true)
    expect(calls).toBe(0)
    tokens.set("old", clock.now() + 30_000)
    await auth.refreshIfNeeded()
    expect(calls).toBe(1)
    server.events.removeAllListeners()
  })

  it("is single flight: concurrent callers share one request", async () => {
    const { refresher } = setup()
    let calls = 0
    server.events.on("request:start", ({ request }) => {
      if (request.url.endsWith("/auth/refresh")) calls++
    })
    const [a, b] = await Promise.all([refresher.refresh(), refresher.refresh()])
    server.events.removeAllListeners()
    expect(calls).toBe(1)
    expect(a).toEqual(b)
  })

  it("uses a token another tab just refreshed instead of rotating again", async () => {
    const bus = new EventTarget()
    const channel: BroadcastLike = {
      postMessage: (data) =>
        bus.dispatchEvent(Object.assign(new Event("message"), { data })),
      addEventListener: (_t, l) =>
        bus.addEventListener("message", l as unknown as EventListener),
      removeEventListener: (_t, l) =>
        bus.removeEventListener("message", l as unknown as EventListener),
    }
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => (release = r))
    let first = true
    const locks = {
      async request<TResult>(_n: string, cb: () => Promise<TResult>) {
        if (first) {
          first = false
          await gate // the other tab holds the lock and refreshes meanwhile
        }
        return cb()
      },
    }
    const tabA = setup({ channel, locks })
    let calls = 0
    server.events.on("request:start", ({ request }) => {
      if (request.url.endsWith("/auth/refresh")) calls++
    })
    const pending = tabA.refresher.refresh()
    channel.postMessage({
      type: "token",
      token: "from-tab-b",
      expiresAt: tabA.clock.now() + 15 * 60_000,
    })
    release()
    expect(await pending).toEqual({ kind: "ok", session: null })
    expect(tabA.tokens.get()).toBe("from-tab-b")
    expect(calls).toBe(0)
    server.events.removeAllListeners()
  })
})

describe("logout", () => {
  it("asks first when there are unsynced changes, then wipes everything", async () => {
    const { db, auth, tokens, events } = setup()
    await auth.login(MOCK_CREDENTIALS.username, MOCK_CREDENTIALS.password)
    await db.outbox.add({
      opId: "o",
      userId: MOCK_USER_ID,
      entity: "comment",
      recordId: "r",
      recordKey: "comment:r",
      eventKey: "2026casj",
      kind: "create",
      state: "queued",
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: 0,
    })
    expect(await auth.logout()).toEqual({ ok: false, pendingChanges: 1 })
    let logoutCalls = 0
    server.events.on("request:start", ({ request }) => {
      if (request.url.endsWith("/auth/logout")) logoutCalls++
    })
    expect(await auth.logout({ force: true })).toEqual({ ok: true })
    server.events.removeAllListeners()
    expect(logoutCalls).toBe(1)
    expect(await db.outbox.count()).toBe(0)
    expect(await db.session.count()).toBe(0)
    expect(tokens.get()).toBeNull()
    expect(auth.getSession()).toBeNull()
    expect(events).toContain("out:logout")
    expect(await auth.pendingChanges()).toBe(0)
  })

  it("a sign-in made while the wipe is still running waits for it, then works", async () => {
    const { db, auth } = setup()
    await auth.login(MOCK_CREDENTIALS.username, MOCK_CREDENTIALS.password)
    const out = auth.logout({ force: true })
    // the login screen is already showing; the user signs in again right away
    const back = auth.login(
      MOCK_CREDENTIALS.username,
      MOCK_CREDENTIALS.password
    )
    await expect(out).resolves.toEqual({ ok: true })
    await expect(back).resolves.toMatchObject({ userId: MOCK_USER_ID })
    expect(await db.session.count()).toBe(1)
  })

  it("wipes even when the logout call fails or the device is offline", async () => {
    server.use(http.post(`${API}/auth/logout`, () => HttpResponse.error()))
    const { db, auth } = setup()
    await auth.login(MOCK_CREDENTIALS.username, MOCK_CREDENTIALS.password)
    await setKv(db, "pinnedEventKeys", ["2026casj"])
    expect(await auth.logout({ reason: "guest_access_disabled" })).toEqual({
      ok: true,
    })
    expect(await getKv(db, "pinnedEventKeys")).toBeUndefined()
  })
})

describe("expiry warning (ADR-035)", () => {
  const at = (hoursLeft: number): Session => ({
    userId: "u",
    displayName: "U",
    role: "scouter",
    status: "active",
    eventKey: null,
    refreshExpiresAt: hoursLeft * 3_600_000,
  })
  it.each([
    [100, "ok"],
    [47, "warn"],
    [23, "urgent"],
    [0, "expired"],
  ] as const)("%i h left → %s", (h, state) => {
    expect(expiryState(at(h), 0)).toBe(state)
  })
  it("no session is fine", () => {
    expect(expiryState(null, 0)).toBe("ok")
  })
})

describe("auth edge paths", () => {
  it("maps other server errors on login to unknown", async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ status: 500, code: "boom" }, { status: 500 })
      )
    )
    const { auth } = setup()
    await expect(auth.login("alex", "x")).rejects.toMatchObject({
      code: "unknown",
    })
  })

  it("stays signed out when /me is malformed during recovery", async () => {
    server.use(http.get(`${API}/me`, () => HttpResponse.json({ nope: true })))
    const { auth } = setup()
    expect(await auth.ensureLoaded()).toBeNull()
  })

  it("refresh while signed out doesn't create a session", async () => {
    const { auth, db } = setup()
    expect(await auth.refresh()).toBe(true)
    expect(await db.session.count()).toBe(0)
    mockBackend.refreshValid = false
    expect(await auth.refresh()).toBe(false)
    expect(auth.getSession()).toBeNull()
  })

  it("does nothing network-related offline", async () => {
    const { auth, db } = setup({ online: false })
    expect(await auth.refreshIfNeeded()).toBe(false)
    await db.session.put({
      id: "current",
      userId: "u",
      username: "u",
      displayName: "U",
      role: "scouter",
      eventKey: null,
      refreshExpiresAt: Date.UTC(2026, 2, 21),
      status: "active",
      lastVerifiedAt: 0,
    })
    await auth.ensureLoaded()
    expect(auth.expiry()).toBe("urgent")
    let calls = 0
    server.events.on("request:start", () => calls++)
    expect(await auth.logout()).toEqual({ ok: true })
    server.events.removeAllListeners()
    expect(calls).toBe(0)
  })

  it("ignores a shared token older than the one it has; non-auth errors keep the session", async () => {
    const bus = new EventTarget()
    const channel: BroadcastLike = {
      postMessage: (data) =>
        bus.dispatchEvent(Object.assign(new Event("message"), { data })),
      addEventListener: (_t, l) =>
        bus.addEventListener("message", l as unknown as EventListener),
      removeEventListener: (_t, l) =>
        bus.removeEventListener("message", l as unknown as EventListener),
    }
    const { tokens, refresher } = setup({ channel })
    tokens.set("mine", 5000)
    channel.postMessage({ type: "token", token: "older", expiresAt: 1000 })
    channel.postMessage({ type: "other" })
    expect(tokens.get()).toBe("mine")
    server.use(
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({ status: 500, code: "x" }, { status: 500 })
      )
    )
    expect(await refresher.refresh()).toEqual({ kind: "offline" })
  })
})
