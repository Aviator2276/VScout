import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FakeBroker } from "@/testing/mqtt/fake-broker"
import { MAX_IN_FLIGHT, RpcError, createRpcChannel } from "../rpc-channel"

const topics = { request: "vscout/rpc/req/u/d", response: "vscout/rpc/res/u/d" }
const req = (id: string) => ({
  v: 1 as const,
  id,
  method: "GET" as const,
  path: "/meta",
  headers: {},
})
const reply = (id: string, status = 200) =>
  JSON.stringify({ v: 1, id, status, headers: {}, body: { id } })
const corr = (id: string) => new TextEncoder().encode(id)

describe("rpc-channel", () => {
  let broker: FakeBroker
  beforeEach(() => {
    broker = new FakeBroker()
  })
  afterEach(() => vi.useRealTimers())

  it("matches responses by correlationData, in any order, with request properties set", async () => {
    const ch = createRpcChannel(broker, topics)
    const a = ch.request(req("a"), 8000)
    const b = ch.request(req("b"), 8000)
    await Promise.resolve()
    broker.deliver(reply("b"), corr("b"))
    broker.deliver(reply("a"), corr("a"))
    expect((await a).body).toEqual({ id: "a" })
    expect((await b).body).toEqual({ id: "b" })
    expect(broker.published[0]?.props).toMatchObject({
      responseTopic: topics.response,
      messageExpiryInterval: 8,
      contentType: "application/json",
    })
    expect(broker.published[0]?.topic).toBe(topics.request)
  })

  it("falls back to the payload id when correlationData is missing", async () => {
    const ch = createRpcChannel(broker, topics)
    const a = ch.request(req("a"), 8000)
    await Promise.resolve()
    broker.deliver(reply("a"))
    expect((await a).status).toBe(200)
  })

  it("times out, and drops (counts) a response that arrives late", async () => {
    vi.useFakeTimers()
    const ch = createRpcChannel(broker, topics)
    const a = ch.request(req("a"), 1000)
    vi.advanceTimersByTime(1001)
    await expect(a).rejects.toMatchObject({ kind: "timeout" })
    broker.deliver(reply("a"), corr("a"))
    expect(ch.stats().lateResponses).toBe(1)
  })

  it("rejects everything pending on disconnect, and fails fast when not ready", async () => {
    const ch = createRpcChannel(broker, topics)
    const a = ch.request(req("a"), 8000)
    const b = ch.request(req("b"), 8000)
    broker.disconnect()
    await expect(a).rejects.toBeInstanceOf(RpcError)
    await expect(b).rejects.toMatchObject({ kind: "disconnected" })
    await expect(ch.request(req("c"), 8000)).rejects.toMatchObject({
      kind: "not-ready",
    })
  })

  it(`keeps at most ${MAX_IN_FLIGHT} requests in flight and queues the rest in order`, async () => {
    const ch = createRpcChannel(broker, topics)
    const all = ["1", "2", "3", "4", "5", "6"].map((id) =>
      ch.request(req(id), 8000)
    )
    await Promise.resolve()
    expect(broker.published).toHaveLength(MAX_IN_FLIGHT)
    expect(ch.stats()).toMatchObject({ inFlight: 4, queued: 2 })
    broker.deliver(reply("1"), corr("1"))
    await all[0]
    expect(
      broker.published.map((p) => (JSON.parse(p.payload) as { id: string }).id)
    ).toEqual(["1", "2", "3", "4", "5"])
  })

  it("reports publish failures and malformed responses", async () => {
    const ch = createRpcChannel(broker, topics)
    broker.failPublish = true
    await expect(ch.request(req("a"), 8000)).rejects.toMatchObject({
      kind: "publish-failed",
    })
    broker.failPublish = false
    const b = ch.request(req("b"), 8000)
    await Promise.resolve()
    broker.deliver("{not json", corr("b"))
    await expect(b).rejects.toMatchObject({ kind: "bad-response" })
    broker.deliver("{not json") // no id at all: ignored
    ch.dispose()
  })
})
