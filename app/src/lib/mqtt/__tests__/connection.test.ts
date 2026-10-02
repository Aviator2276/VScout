import { afterEach, describe, expect, it, vi } from "vitest"
import type { InboxMessage } from "@/lib/contracts/mqtt"
import { createRpcChannel } from "@/lib/mqtt/rpc-channel"
import { createIngest } from "@/lib/sync/ingest"
import { createTestDb, testDeps } from "@/testing/db"
import { wireEnvelope, wireMatch, wireMessage } from "@/testing/factories/wire"
import { FakeMqttBroker, settle } from "@/testing/mqtt/fake-mqtt"
import { createMqttConnection } from "../mqtt-client"
import type { MqttDeps, MqttSession } from "../mqtt-client"

const USER = "01900000-0000-7000-8000-000000009000"
const DEVICE = "dev1"
const CLIENT = `vscout-${USER}-${DEVICE}`
const EVENT = "2026casj"

afterEach(() => vi.useRealTimers())

function setup(
  o: {
    role?: MqttSession["role"]
    refresh?: () => Promise<boolean>
    eventKey?: string | null
    random?: () => number
  } = {}
) {
  const broker = new FakeMqttBroker()
  const db = createTestDb()
  const { applyCtx } = testDeps(db)
  const ingest = createIngest(applyCtx)
  const ingestCalls: Array<number> = []
  const syncs: Array<string> = []
  const inbox: Array<InboxMessage> = []
  let token = "t1"
  let eventKey: string | null = o.eventKey === undefined ? EVENT : o.eventKey
  const deps: MqttDeps = {
    transportFactory: broker.factory,
    url: "ws://fake",
    deviceId: DEVICE,
    appVersion: "2.0.0-alpha.0",
    auth: {
      getSession: () => ({ userId: USER, role: o.role ?? "scouter" }),
      getAccessToken: () => token,
      refresh:
        o.refresh ??
        (() => {
          token = "t2"
          return Promise.resolve(true)
        }),
    },
    getActiveEventKey: () => eventKey,
    ingest: async (raws) => {
      ingestCalls.push(raws.length)
      await ingest(raws)
    },
    requestSync: (reason) => syncs.push(reason),
    onInbox: (m) => inbox.push(m),
    random: o.random ?? (() => 0),
    lanes: { normalMs: 5, bulkMs: 5 },
  }
  const conn = createMqttConnection(deps)
  return {
    broker,
    db,
    conn,
    syncs,
    inbox,
    ingestCalls,
    setEvent: (ek: string | null) => (eventKey = ek),
  }
}

describe("MQTT connection", () => {
  it("connects, subscribes RPC first, announces presence, then asks for a delta sync", async () => {
    const { broker, conn, syncs } = setup()
    conn.start()
    await settle()
    expect(conn.status.getSnapshot()).toMatchObject({
      state: "connected",
      isLeader: true,
    })
    const subs = broker.subscriptions(CLIENT)
    expect(subs[0]).toBe(`vscout/rpc/res/${USER}/${DEVICE}`)
    expect(subs).toContain(`vscout/event/${EVENT}/chat/#`)
    expect(syncs).toEqual(["mqtt-reconnect"])
    expect(
      broker.retained.get(`vscout/event/${EVENT}/presence/${USER}/${DEVICE}`)
    ).toContain('"online"')
    expect(conn.rpcLink.isReady()).toBe(true)
  })

  it("never subscribes guests to chat or presence and never publishes their presence (ADR-066)", async () => {
    const { broker, conn } = setup({ role: "guest" })
    conn.start()
    await settle()
    expect(
      broker.subscriptions(CLIENT).some((s) => /chat|presence/.test(s))
    ).toBe(false)
    expect(broker.published.filter((p) => p.from === CLIENT)).toEqual([])
    conn.publishTyping("event:2026casj", "typing")
    await settle()
    expect(broker.published.filter((p) => p.from === CLIENT)).toEqual([])
  })

  it("writes a data envelope to Dexie and batches a burst into one transaction", async () => {
    const { broker, conn, db, ingestCalls } = setup()
    conn.start()
    await settle()
    for (let n = 1; n <= 30; n++)
      broker.publishFromServer(
        `vscout/event/${EVENT}/data/match`,
        wireEnvelope("match", wireMatch({ matchNumber: n }))
      )
    await settle(10)
    await conn.drain()
    expect(await db.matches.count()).toBe(30)
    expect(ingestCalls).toEqual([30])
  })

  it("applies an announcement immediately on the urgent lane", async () => {
    const { broker, conn, db } = setup()
    conn.start()
    await settle()
    const ann = wireMessage({ kind: "announcement", body: "Pit closes at 6" })
    broker.publishFromServer(
      `vscout/event/${EVENT}/data/message`,
      wireEnvelope("message", ann)
    )
    // the urgent lane needs no batch timer: wait for the write, not a fixed number of ticks
    await vi.waitFor(async () =>
      expect((await db.messages.get(ann.id))?.body).toBe("Pit closes at 6")
    )
  })

  it("drops invalid payloads and counts them", async () => {
    const { broker, conn } = setup()
    conn.start()
    await settle()
    broker.publishFromServer(`vscout/event/${EVENT}/data/match`, "{not json")
    broker.publishFromServer(
      `vscout/event/2026other/data/match`,
      wireEnvelope("match", wireMatch())
    )
    await settle()
    // the second isn't subscribed, so only the first arrives and is dropped
    expect(conn.status.getSnapshot().droppedPayloads).toBe(1)
  })

  it("reconnects with backoff after the socket dies, and the will marks the device offline", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { broker, conn, syncs } = setup({ random: () => 0.99 }) // first retry after 990 ms
    conn.start()
    await settle()
    broker.drop(CLIENT)
    await settle()
    expect(conn.status.getSnapshot().state).toBe("reconnecting")
    expect(
      broker.retained.get(`vscout/event/${EVENT}/presence/${USER}/${DEVICE}`)
    ).toContain('"lwt"')
    await vi.advanceTimersByTimeAsync(1000)
    await settle()
    expect(conn.status.getSnapshot()).toMatchObject({
      state: "connected",
      attempt: 0,
    })
    expect(broker.subscriptions(CLIENT).length).toBeGreaterThan(4)
    expect(syncs).toEqual(["mqtt-reconnect", "mqtt-reconnect"])
  })

  it("refreshes the token once on an auth rejection, then reconnects with the new one", async () => {
    const { broker, conn } = setup()
    broker.rejectNextConnect(135)
    conn.start()
    await settle(10)
    expect(conn.status.getSnapshot().state).toBe("connected")
    expect(broker.lastPassword(CLIENT)).toBe("t2")
  })

  it("stops at unauthorized when the refresh fails", async () => {
    const { broker, conn } = setup({ refresh: () => Promise.resolve(false) })
    broker.rejectNextConnect(134)
    conn.start()
    await settle(10)
    expect(conn.status.getSnapshot().state).toBe("unauthorized")
  })

  it("goes to displaced on session takeover (142) without retrying", async () => {
    const { broker, conn } = setup()
    conn.start()
    await settle()
    broker.kick(CLIENT, 142)
    await settle()
    expect(conn.status.getSnapshot().state).toBe("displaced")
    expect(broker.clientIds()).toEqual([])
    conn.handle({ type: "VISIBLE", hiddenMs: 0 })
    await settle()
    expect(conn.status.getSnapshot().state).toBe("connected")
  })

  it("switching events publishes offline on the old event and resubscribes to the new one", async () => {
    const { broker, conn, setEvent } = setup()
    conn.start()
    await settle()
    setEvent("2026abc")
    conn.activeEventChanged()
    await settle(10)
    expect(
      broker.retained.get(`vscout/event/${EVENT}/presence/${USER}/${DEVICE}`)
    ).toContain('"offline"')
    expect(broker.subscriptions(CLIENT)).toContain(
      "vscout/event/2026abc/data/#"
    )
    expect(broker.subscriptions(CLIENT)).not.toContain(
      `vscout/event/${EVENT}/data/#`
    )
  })

  it("passes inbox messages up and refreshes + reconnects on a role change", async () => {
    const { broker, conn, inbox } = setup()
    conn.start()
    await settle()
    const ts = "2026-03-20T15:00:00.000Z"
    broker.publishFromServer(`vscout/user/${USER}/inbox`, {
      v: 1,
      kind: "roleChanged",
      role: "admin",
      ts,
    })
    await settle(10)
    expect(inbox).toMatchObject([{ kind: "roleChanged" }])
    expect(broker.lastPassword(CLIENT)).toBe("t2")
  })

  it("keeps working when one subscription is denied (SUBACK 135)", async () => {
    const { broker, conn } = setup()
    broker.setAcl(
      (_c, action, topic) => !(action === "sub" && topic.includes("presence"))
    )
    conn.start()
    await settle()
    expect(broker.subscriptions(CLIENT)).not.toContain(
      `vscout/event/${EVENT}/presence/#`
    )
    expect(broker.subscriptions(CLIENT)).toContain(
      `vscout/event/${EVENT}/data/#`
    )
  })

  it("answers RPC over the live connection from the same backend handlers", async () => {
    const { broker, conn } = setup()
    broker.serveRpc()
    conn.start()
    await settle()
    const topics = conn.rpcTopics()
    if (!topics) throw new Error("no rpc topics")
    const channel = createRpcChannel(conn.rpcLink, topics)
    const res = await channel.request(
      { v: 1, id: "r1", method: "GET", path: "/meta", headers: {} },
      2000
    )
    expect(res.status).toBe(200)
    // a dropped connection rejects pending RPC so callers fall back to HTTP at once
    broker.dropRpcResponses = true
    const pending = channel.request(
      { v: 1, id: "r2", method: "GET", path: "/meta", headers: {} },
      5000
    )
    broker.drop(CLIENT)
    await expect(pending).rejects.toMatchObject({ kind: "disconnected" })
  })

  it("publishes typing at most once per 3 s, and goes idle on stop", async () => {
    const { broker, conn } = setup()
    conn.start()
    await settle()
    conn.setUiTopics({ typingChannel: "event:2026casj" })
    conn.publishTyping("event:2026casj", "typing")
    conn.publishTyping("event:2026casj", "typing")
    await settle()
    const typing = broker.published.filter((p) => p.topic.includes("/typing/"))
    expect(typing).toHaveLength(1)
    await conn.stop()
    expect(conn.status.getSnapshot().state).toBe("idle")
    expect(
      broker.retained.get(`vscout/event/${EVENT}/presence/${USER}/${DEVICE}`)
    ).toContain('"offline"')
  })

  it("waits as a follower and connects when it gains leadership", async () => {
    const { conn } = setup()
    conn.start({ leader: false })
    expect(conn.status.getSnapshot().state).toBe("follower")
    conn.handle({ type: "LEADER_GAINED" })
    await settle()
    expect(conn.status.getSnapshot().state).toBe("connected")
    conn.handle({ type: "LEADER_LOST" })
    expect(conn.status.getSnapshot().state).toBe("follower")
  })
})

describe("MQTT connection: callbacks and edge paths", () => {
  it("passes control, status and alerts to the app; updates the password after a refresh", async () => {
    const broker = new FakeMqttBroker()
    const seen: Array<string> = []
    let token = "a"
    const conn = createMqttConnection({
      transportFactory: broker.factory,
      url: "ws://fake",
      deviceId: DEVICE,
      appVersion: "x",
      auth: {
        getSession: () => ({ userId: USER, role: "admin" }),
        getAccessToken: () => token,
        refresh: () => Promise.resolve(true),
      },
      getActiveEventKey: () => EVENT,
      ingest: () => Promise.resolve(),
      requestSync: (reason, opts) =>
        seen.push(`${reason}:${opts?.entities?.join(",") ?? ""}`),
      onSysStatus: (s) => seen.push(`sys:${s.minClientVersion}`),
      onAdminAlert: (a) => seen.push(`alert:${a.kind}`),
      onReload: (v) => seen.push(`reload:${v}`),
    })
    conn.start()
    await settle()
    const ts = "2026-03-20T15:00:00.000Z"
    broker.publishFromServer(`vscout/event/${EVENT}/control`, {
      v: 1,
      cmd: "resync",
      entities: ["eventTeam"],
      ts,
    })
    broker.publishFromServer(`vscout/event/${EVENT}/control`, {
      v: 1,
      cmd: "reload",
      minClientVersion: "2.1.0",
      ts,
    })
    broker.publishFromServer(
      "vscout/sys/status",
      {
        v: 1,
        minClientVersion: "2.0.0",
        maintenance: false,
        message: null,
        ts,
      },
      { retain: true }
    )
    broker.publishFromServer(`vscout/event/${EVENT}/admin/alerts`, {
      v: 1,
      kind: "importFailed",
      message: "x",
      ts,
    })
    await settle()
    expect(seen).toEqual([
      "mqtt-reconnect:",
      "mqtt-control:eventTeam",
      "reload:2.1.0",
      "sys:2.0.0",
      "alert:importFailed",
    ])

    token = "b"
    conn.handle({ type: "TOKEN_REFRESHED" })
    expect(broker.lastPassword(CLIENT)).toBe("b")

    conn.handle({ type: "HIDDEN" })
    await settle()
    expect(
      broker.retained.get(`vscout/event/${EVENT}/presence/${USER}/${DEVICE}`)
    ).toContain('"away"')
  })

  it("treats a missing token like an auth failure and does nothing for disconnected publishes", async () => {
    const broker = new FakeMqttBroker()
    const conn = createMqttConnection({
      transportFactory: broker.factory,
      url: "ws://fake",
      deviceId: DEVICE,
      appVersion: "x",
      auth: {
        getSession: () => ({ userId: USER, role: "scouter" }),
        getAccessToken: () => null,
        refresh: () => Promise.resolve(false),
      },
      getActiveEventKey: () => null,
      ingest: () => Promise.resolve(),
      requestSync: () => undefined,
    })
    conn.publishTyping("c", "typing")
    conn.setUiTopics({ typingChannel: "c" })
    conn.activeEventChanged()
    await expect(
      conn.rpcLink.publish("t", "{}", {
        responseTopic: "r",
        correlationData: new Uint8Array(),
        contentType: "application/json",
        messageExpiryInterval: 1,
      })
    ).rejects.toThrow()
    conn.start()
    await settle()
    expect(conn.status.getSnapshot().state).toBe("unauthorized")
    expect(broker.published).toEqual([])
  })
})
