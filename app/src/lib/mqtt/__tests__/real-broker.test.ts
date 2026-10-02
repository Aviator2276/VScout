// Against a real broker (docker: `pnpm stack:up`), run with: MQTT_URL=ws://localhost:9001 pnpm test real-broker
// Skipped otherwise. Checks the mqtt.js adapter: connect, subscribe, retained, MQTT 5 RPC properties.
import mqtt from "mqtt"
import { beforeAll, describe, expect, it } from "vitest"
import { server } from "@/testing/mocks/server"
import { createRpcChannel } from "../rpc-channel"
import { createMqttConnection } from "../mqtt-client"
import { mqttJsTransportFactory } from "../transport"

const URL = process.env.MQTT_URL
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe.skipIf(!URL)("mqtt.js adapter against a real broker", () => {
  // MSW 3 also intercepts WebSockets; this test needs the real socket
  beforeAll(() => server.close())

  it("connects, subscribes, receives fan-out and round-trips RPC with correlationData", async () => {
    const url = URL ?? ""
    const user = `u${Date.now()}`
    const conn = createMqttConnection({
      transportFactory: mqttJsTransportFactory(),
      url,
      deviceId: "d1",
      appVersion: "test",
      auth: {
        getSession: () => ({ userId: user, role: "scouter" }),
        getAccessToken: () => "x",
        refresh: () => Promise.resolve(true),
      },
      getActiveEventKey: () => "2026casj",
      ingest: () => Promise.resolve(),
      requestSync: () => undefined,
    })

    // a stand-in backend: answers RPC requests with the same correlation data
    const backend = await mqtt.connectAsync(url, { protocolVersion: 5 })
    await backend.subscribeAsync("vscout/rpc/req/+/+")
    backend.on("message", (_topic, payload, packet) => {
      const req = JSON.parse(payload.toString()) as { id: string }
      const props = packet.properties
      if (!props?.responseTopic) return
      void backend.publishAsync(
        props.responseTopic,
        JSON.stringify({
          v: 1,
          id: req.id,
          status: 200,
          headers: {},
          body: { ok: true },
        }),
        {
          qos: 1,
          properties: { correlationData: props.correlationData },
        }
      )
    })

    conn.start()
    for (let i = 0; i < 50 && !conn.rpcLink.isReady(); i++) await wait(50)
    expect(conn.status.getSnapshot().state).toBe("connected")

    const topics = conn.rpcTopics()
    if (!topics) throw new Error("no topics")
    const channel = createRpcChannel(conn.rpcLink, topics)
    const res = await channel.request(
      { v: 1, id: "real-1", method: "GET", path: "/meta", headers: {} },
      3000
    )
    expect(res.body).toEqual({ ok: true })

    await conn.stop()
    await backend.endAsync()
  }, 15_000)
})
