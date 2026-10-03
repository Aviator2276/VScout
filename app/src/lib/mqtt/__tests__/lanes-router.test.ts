import { afterEach, describe, expect, it, vi } from "vitest"
import { createLaneBatcher } from "../lanes"
import type { Lane } from "../lanes"
import { createPresenceStores } from "../presence-store"
import { createRouter } from "../router"
import type { RouterHandlers } from "../router"

afterEach(() => vi.useRealTimers())
const enc = (x: unknown) =>
  new TextEncoder().encode(typeof x === "string" ? x : JSON.stringify(x))

describe("lane batcher (mqtt.md §8.2)", () => {
  it("applies an announcement before the first batch of a 500-envelope bulk burst", async () => {
    vi.useFakeTimers()
    const calls: Array<{ lane: Lane; n: number }> = []
    const b = createLaneBatcher(async (raws, lane) => {
      calls.push({ lane, n: raws.length })
    })
    for (let i = 0; i < 500; i++) b.push("bulk", { i })
    b.push("urgent", { announcement: true })
    await vi.advanceTimersByTimeAsync(0)
    // a full bulk batch (100) may run when it fills, but the urgent one goes before the timed batches
    const urgentAt = calls.findIndex((c) => c.lane === "urgent")
    expect(urgentAt).toBeGreaterThanOrEqual(0)
    expect(calls.slice(0, urgentAt).every((c) => c.n === 100)).toBe(true)
    await b.drain()
    expect(
      calls.filter((c) => c.lane === "bulk").reduce((n, c) => n + c.n, 0)
    ).toBe(500)
  })

  it("batches normal items for 50 ms into one ingest call", async () => {
    vi.useFakeTimers()
    const calls: Array<number> = []
    const b = createLaneBatcher(async (raws) => {
      calls.push(raws.length)
    })
    for (let i = 0; i < 30; i++) b.push("normal", i)
    await vi.advanceTimersByTimeAsync(49)
    expect(calls).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toEqual([30])
  })

  it("keeps going after an ingest error, and dispose drops what's queued", async () => {
    let n = 0
    const b = createLaneBatcher(async () => {
      n++
      if (n === 1) throw new Error("boom")
    })
    b.push("urgent", 1)
    b.push("urgent", 2)
    await b.drain()
    expect(n).toBe(2)
    b.push("bulk", 3)
    b.dispose()
    await b.drain()
    expect(n).toBe(2)
  })

  it("runs bulk when it's been starved for a second", async () => {
    vi.useFakeTimers()
    let t = 0
    const order: Array<Lane> = []
    const gate: { open?: () => void } = {}
    const b = createLaneBatcher(
      (_raws, lane) => {
        order.push(lane)
        return lane === "urgent" && order.length === 1
          ? new Promise<void>((r) => (gate.open = r))
          : Promise.resolve()
      },
      { now: () => t }
    )
    b.push("urgent", 0) // in flight, blocked
    await vi.advanceTimersByTimeAsync(0)
    b.push("bulk", 1)
    t = 1500
    b.push("urgent", 2)
    gate.open?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(["urgent", "bulk", "urgent"])
  })
})

describe("router consistency checks (mqtt.md §6)", () => {
  function setup(userId = "u1") {
    const seen: Record<string, Array<unknown>> = {
      data: [],
      drop: [],
      control: [],
      sys: [],
      inbox: [],
      alert: [],
      rpc: [],
    }
    const h: RouterHandlers = {
      userId: () => userId,
      data: (raw, lane) => seen.data?.push([raw, lane]),
      rpcResponse: (p) => seen.rpc?.push(p),
      control: (m) => seen.control?.push(m),
      sysStatus: (m) => seen.sys?.push(m),
      inbox: (m) => seen.inbox?.push(m),
      adminAlert: (m) => seen.alert?.push(m),
      presence: createPresenceStores(),
      now: () => 1000,
      onDrop: (reason) => seen.drop?.push(reason),
    }
    return { dispatch: createRouter(h), seen, h }
  }
  const env = (o: Record<string, unknown> = {}) => ({
    v: 1,
    entity: "match",
    op: "upsert",
    id: "x",
    rev: 1,
    eventKey: "2026casj",
    ts: "2026-03-20T15:00:00.000Z",
    data: {},
    ...o,
  })

  it.each([
    ["unknown-topic", "vscout/nope", env()],
    ["bad-json", "vscout/event/2026casj/data/match", "{nope"],
    ["entity-mismatch", "vscout/event/2026casj/data/team", env()],
    ["event-mismatch", "vscout/event/2026abc/data/match", env()],
    [
      "chat-kind-mismatch",
      "vscout/event/2026casj/chat/message",
      env({ entity: "message", data: { kind: "announcement" } }),
    ],
    [
      "user-mismatch",
      "vscout/user/someone/data/message",
      env({ entity: "message", eventKey: null }),
    ],
    ["bad-envelope", "vscout/event/2026casj/data/match", 42],
    [
      "bad-control",
      "vscout/event/2026casj/control",
      { v: 1, cmd: "explode", ts: "x" },
    ],
    ["bad-sys-status", "vscout/sys/status", { v: 1 }],
    [
      "user-mismatch",
      "vscout/user/someone/inbox",
      { v: 1, kind: "sessionRevoked", ts: "2026-03-20T15:00:00.000Z" },
    ],
    [
      "bad-inbox",
      "vscout/user/u1/inbox",
      { v: 1, kind: "unknownKind", ts: "2026-03-20T15:00:00.000Z" },
    ],
    ["bad-admin-alert", "vscout/event/2026casj/admin/alerts", { v: 1 }],
    [
      "bad-presence",
      "vscout/event/2026casj/presence/u2/d2",
      { v: 1, status: "online", userId: "u3", deviceId: "d2" },
    ],
    [
      "bad-typing",
      "vscout/event/2026casj/typing/c/u2",
      {
        v: 1,
        channelId: "c",
        userId: "u9",
        state: "typing",
        ts: "2026-03-20T15:00:00.000Z",
      },
    ],
  ])("drops %s", (reason, topic, payload) => {
    const { dispatch, seen } = setup()
    dispatch(topic, enc(payload))
    expect(seen.drop).toEqual([reason])
    expect(seen.data).toEqual([])
  })

  it("drops oversized fan-out but allows a 1 MiB-scale RPC response", () => {
    const { dispatch, seen } = setup()
    dispatch("vscout/event/2026casj/data/match", new Uint8Array(300 * 1024))
    expect(seen.drop).toEqual(["too-large"])
    dispatch("vscout/rpc/res/u1/d1", enc("x".repeat(300 * 1024)))
    expect(seen.rpc).toHaveLength(1)
  })

  it("routes valid messages to their handlers and stores presence and typing", () => {
    const { dispatch, seen, h } = setup()
    const ts = "2026-03-20T15:00:00.000Z"
    dispatch("vscout/event/2026casj/data/match", enc(env()))
    dispatch(
      "vscout/event/2026casj/control",
      enc({ v: 1, cmd: "resync", entities: ["eventTeam"], ts })
    )
    dispatch(
      "vscout/sys/status",
      enc({
        v: 1,
        minClientVersion: "2.0.0",
        maintenance: false,
        message: null,
        ts,
      })
    )
    dispatch(
      "vscout/user/u1/inbox",
      enc({ v: 1, kind: "forceLogout", reason: "account_disabled", ts })
    )
    dispatch(
      "vscout/event/2026casj/admin/alerts",
      enc({ v: 1, kind: "importFailed", message: "TBA 503", ts })
    )
    dispatch(
      "vscout/event/2026casj/presence/u2/d2",
      enc({ v: 1, status: "online", userId: "u2", deviceId: "d2", ts })
    )
    dispatch(
      "vscout/event/2026casj/presence/u3/d3",
      enc({
        v: 1,
        status: "offline",
        userId: "u3",
        deviceId: "d3",
        reason: "lwt",
      })
    )
    dispatch(
      "vscout/event/2026casj/typing/c/u2",
      enc({ v: 1, channelId: "c", userId: "u2", state: "typing", ts })
    )
    dispatch("vscout/event/2026casj/presence/u4/d4", enc("")) // a cleared retained message
    expect(seen.data).toEqual([[env(), "normal"]])
    expect(
      [seen.control, seen.sys, seen.inbox, seen.alert].map((x) => x?.length)
    ).toEqual([1, 1, 1, 1])
    expect(h.presence.presence.getSnapshot().get("u2/d2")).toMatchObject({
      status: "online",
      at: Date.parse(ts),
    })
    expect(h.presence.presence.getSnapshot().get("u3/d3")).toMatchObject({
      status: "offline",
      at: 1000,
    })
    expect(h.presence.typing.getSnapshot().get("c")).toEqual(["u2"])
    h.presence.setTyping("c", "u2", "idle", 1)
    expect(h.presence.typing.getSnapshot().get("c")).toBeUndefined()
    h.presence.setTyping("c", "u5", "typing", 0)
    h.presence.expireTyping(10_000)
    expect(h.presence.typing.getSnapshot().size).toBe(0)
    expect(seen.drop).toEqual([])
  })
})
