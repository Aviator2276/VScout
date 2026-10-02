import { HttpResponse, delay, http } from "msw"
import { describe, expect, it } from "vitest"
import { NO_CAPABILITIES } from "@/lib/api/adapters/meta-adapter"
import { createCapabilitiesStore } from "@/lib/api/capabilities"
import { createRpcChannel } from "@/lib/mqtt/rpc-channel"
import { seqIds } from "@/testing/db"
import { server } from "@/testing/mocks/server"
import { FakeBroker } from "@/testing/mqtt/fake-broker"
import { createHttpTransport } from "../http-transport"
import {
  MAX_RPC_REQUEST_BYTES,
  createMqttRpcTransport,
} from "../mqtt-rpc-transport"

const API = "http://localhost/api/v1"
const get = {
  method: "GET" as const,
  path: "/slow",
  headers: {},
  class: "delta" as const,
}

describe("HttpTransport", () => {
  it("times out with a transport failure", async () => {
    server.use(
      http.get(
        `${API}/slow`,
        async () => (await delay(200), HttpResponse.json({}))
      )
    )
    await expect(
      createHttpTransport({ baseUrl: API }).send(get, 20)
    ).rejects.toMatchObject({ kind: "timeout", transport: "http" })
  })

  it("returns text bodies, empty bodies and lower-cased headers", async () => {
    server.use(
      http.get(
        `${API}/text`,
        () => new HttpResponse("plain", { headers: { "X-Thing": "1" } })
      ),
      http.delete(`${API}/empty`, () => new HttpResponse(null, { status: 204 }))
    )
    const t = createHttpTransport({ baseUrl: API })
    expect(await t.send({ ...get, path: "/text" }, 1000)).toMatchObject({
      body: "plain",
      headers: { "x-thing": "1" },
    })
    expect(
      await t.send({ ...get, method: "DELETE", path: "/empty" }, 1000)
    ).toMatchObject({ status: 204, body: null })
  })
})

describe("MqttRpcTransport", () => {
  it("isn't available without a channel, capability or connection", async () => {
    const broker = new FakeBroker()
    const channel = createRpcChannel(broker, { request: "q", response: "r" })
    const ids = seqIds("rpc")
    expect(
      createMqttRpcTransport({
        channel: () => null,
        ids,
        enabled: () => true,
      }).isAvailable()
    ).toBe(false)
    expect(
      createMqttRpcTransport({
        channel: () => channel,
        ids,
        enabled: () => false,
      }).isAvailable()
    ).toBe(false)
    broker.connected = false
    const t = createMqttRpcTransport({
      channel: () => channel,
      ids,
      enabled: () => true,
    })
    expect(t.isAvailable()).toBe(false)
    await expect(
      createMqttRpcTransport({
        channel: () => null,
        ids,
        enabled: () => true,
      }).send(get, 100)
    ).rejects.toMatchObject({
      kind: "not-ready",
    })
  })

  it("refuses requests above 256 KB (they go over HTTP)", async () => {
    const broker = new FakeBroker()
    const t = createMqttRpcTransport({
      channel: () => createRpcChannel(broker, { request: "q", response: "r" }),
      ids: seqIds("rpc"),
      enabled: () => true,
    })
    const body = { blob: "x".repeat(MAX_RPC_REQUEST_BYTES) }
    await expect(
      t.send({ ...get, method: "POST", body }, 100)
    ).rejects.toMatchObject({ kind: "too-large" })
    expect(broker.published).toHaveLength(0)
  })
})

describe("capabilities store", () => {
  it("notifies only on real changes", () => {
    const store = createCapabilitiesStore()
    let calls = 0
    const off = store.subscribe(() => calls++)
    store.set({ ...NO_CAPABILITIES })
    store.set({ ...NO_CAPABILITIES, mqttRpc: true })
    expect(store.get().mqttRpc).toBe(true)
    expect(calls).toBe(1)
    off()
    store.set(NO_CAPABILITIES)
    expect(calls).toBe(1)
  })
})
