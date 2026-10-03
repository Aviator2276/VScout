import { describe, expect, it, vi } from "vitest"
import { pushPayload } from "@/lib/contracts/push"
import { createApiClient } from "@/lib/api/api-client"
import { createHttpTransport } from "@/lib/api/transport/http-transport"
import { createMqttRpcTransport } from "@/lib/api/transport/mqtt-rpc-transport"
import { TransportHealth } from "@/lib/api/transport/select-transport"
import { getKv } from "@/lib/db/kv"
import { createTestDb, fakeClock, seqIds } from "@/testing/db"
import { API } from "@/testing/engine"
import { mockBackend } from "@/testing/mocks/mock-backend"
import { guardPush } from "../../../sw/lib/session-guard"
import { GENERIC, readPush } from "../../../sw/lib/read-push"
import { createPushClient } from "../push-client"
import type { PushEnv } from "../push-client"
import { computeState } from "../push-state"
import type { PushFacts } from "../push-state"

const base: PushFacts = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  ios: false,
  standalone: false,
  inAppBrowser: false,
  permission: "default",
  subscribed: false,
}
const fresh = { dismissals: 0, lastDismissedAt: null }

describe("computeState (push-notifications.md §2.1)", () => {
  it.each([
    ["iOS in a Safari tab", { ios: true }, "needs-install"],
    [
      "iOS in an in-app browser",
      { ios: true, standalone: true, inAppBrowser: true },
      "needs-install",
    ],
    [
      "iOS Home Screen app, not asked",
      { ios: true, standalone: true },
      "can-prompt",
    ],
    ["no PushManager (iOS < 16.4)", { hasPushManager: false }, "unsupported"],
    ["denied", { permission: "denied" }, "denied"],
    ["granted without a subscription", { permission: "granted" }, "needs-tap"],
    [
      "granted and subscribed",
      { permission: "granted", subscribed: true },
      "subscribed",
    ],
  ] as const)("%s → %s", (_name, facts, expected) => {
    expect(computeState({ ...base, ...facts }, fresh, 0)).toBe(expected)
  })

  it("Not Now snoozes for 3 days, and 3 dismissals stop asking", () => {
    const now = 10 * 86_400_000
    expect(
      computeState(
        base,
        { dismissals: 1, lastDismissedAt: now - 86_400_000 },
        now
      )
    ).toBe("snoozed")
    expect(
      computeState(
        base,
        { dismissals: 1, lastDismissedAt: now - 4 * 86_400_000 },
        now
      )
    ).toBe("can-prompt")
    expect(computeState(base, { dismissals: 3, lastDismissedAt: 0 }, now)).toBe(
      "snoozed"
    )
  })
})

const payload = {
  web_push: 8030,
  mutable: true,
  notification: {
    title: "Dana → you",
    body: "Need a scouter on 254",
    navigate: "https://vscout.example/scout/messages/dm:a:b",
    tag: "message:dm:a:b",
    app_badge: 3,
    data: {
      v: 1,
      id: "01900000-0000-7000-8000-000000000123",
      kind: "message",
      url: "/scout/messages/dm:a:b",
      uid: "01900000-0000-7000-8000-000000009000",
      eventKey: "2026casj",
      entity: { type: "message", id: "x" },
      ts: "2026-10-01T02:50:52.690Z",
    },
  },
}

describe("readPush and the shared-device guard (§6.1–§6.2)", () => {
  it("reads the declarative payload", () => {
    expect(pushPayload.safeParse(payload).success).toBe(true)
    expect(readPush(payload)).toMatchObject({
      title: "Dana → you",
      appBadge: 3,
      options: { tag: "message:dm:a:b" },
    })
  })

  it("anything else becomes the generic notification", () => {
    expect(readPush({ hello: 1 })).toBe(GENERIC)
    expect(readPush(null)).toBe(GENERIC)
  })

  it("a push for another user, or with nobody signed in, shows nothing personal", () => {
    const shown = readPush(payload)
    expect(guardPush(shown, payload.notification.data.uid)).toBe(shown)
    expect(guardPush(shown, "someone-else")).toBe(GENERIC)
    expect(guardPush(shown, null)).toBe(GENERIC)
  })
})

interface FakeSub {
  endpoint: string
  toJSON: () => unknown
  unsubscribe: () => Promise<boolean>
}

function fakeEnv(o: { permission?: NotificationPermission } = {}) {
  let permission: NotificationPermission = o.permission ?? "granted"
  let sub: FakeSub | null = null
  let n = 0
  const subscribe = vi.fn(() => {
    const created: FakeSub = {
      endpoint: `https://fcm.googleapis.com/fcm/send/${++n}`,
      toJSON: () => ({
        endpoint: created.endpoint,
        keys: { p256dh: "p", auth: "a" },
      }),
      unsubscribe: () => {
        sub = null
        return Promise.resolve(true)
      },
    }
    sub = created
    return Promise.resolve(created)
  })
  const registration = {
    pushManager: { getSubscription: () => Promise.resolve(sub), subscribe },
  } as unknown as ServiceWorkerRegistration
  const requestPermission = vi.fn(() => {
    permission = "granted"
    return Promise.resolve(permission)
  })
  const env: PushEnv = {
    registration: () => Promise.resolve(registration),
    permission: () => permission,
    requestPermission,
    ua: "Mozilla/5.0 (Linux; Android 14)",
    platform: "Linux",
    maxTouchPoints: 5,
    standalone: () => true,
  }
  return { env, subscribe, requestPermission, current: () => sub }
}

function client(env: PushEnv | null) {
  mockBackend.reset()
  const db = createTestDb()
  const clock = fakeClock()
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
    accessToken: () => "t",
    refresh: () => Promise.resolve(false),
  })
  const push = createPushClient({
    api,
    db: () => db,
    deviceId: () => Promise.resolve("device-1"),
    now: clock.now,
    appVersion: "2.0.0",
    env,
  })
  return { push, db, clock }
}

describe("push client (§3)", () => {
  it("granted: subscribes silently and PUTs once; reconcile re-PUTs only after 24 h", async () => {
    const f = fakeEnv()
    const { push, db, clock } = client(f.env)
    expect(await push.reconcile()).toBe("subscribed")
    expect(mockBackend.pushSubscriptions.get("device-1")).toMatchObject({
      platform: { os: "android", standalone: true },
    })
    const first = await getKv(db, "pushLastPut")
    await push.reconcile()
    expect((await getKv(db, "pushLastPut"))?.at).toBe(first?.at)
    clock.advance(25 * 3_600_000)
    await push.reconcile()
    expect((await getKv(db, "pushLastPut"))?.at).toBe(clock.now())
    expect(f.subscribe).toHaveBeenCalledTimes(1)
  })

  it("Turn On asks for permission first, then subscribes", async () => {
    const f = fakeEnv({ permission: "default" })
    const { push } = client(f.env)
    expect(await push.refresh()).toBe("can-prompt")
    const done = push.enable()
    expect(f.requestPermission).toHaveBeenCalledTimes(1)
    expect(await done).toBe("subscribed")
  })

  it("turning off deletes the server row and the browser subscription", async () => {
    const f = fakeEnv()
    const { push } = client(f.env)
    await push.reconcile()
    await push.disable()
    expect(mockBackend.pushSubscriptions.has("device-1")).toBe(false)
    expect(f.current()).toBeNull()
  })

  it("a service worker without pushManager (WebKit tab, iOS < 16.4) is unsupported, never a crash", async () => {
    const f = fakeEnv()
    const env: PushEnv = {
      ...f.env,
      registration: () => Promise.resolve({} as ServiceWorkerRegistration),
    }
    const { push } = client(env)
    expect(await push.reconcile()).toBe("unsupported")
    await expect(push.disable()).resolves.toBeUndefined()
  })

  it("no browser APIs: unsupported, and nothing is sent", async () => {
    const { push } = client(null)
    expect(await push.reconcile()).toBe("unsupported")
    expect(mockBackend.pushSubscriptions.size).toBe(0)
  })
})
