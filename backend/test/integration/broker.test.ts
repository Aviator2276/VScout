// Real MQTT 5 broker (Mosquitto 2, anonymous dev config): the API's connection answers RPC on a
// shared subscription and fans out envelopes. Skipped when mosquitto isn't installed.
import { spawn, spawnSync } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import mqtt from "mqtt"
import type { MqttClient } from "mqtt"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { MqttConnection } from "../../src/realtime/mqtt-link.js"
import { RpcServer } from "../../src/realtime/rpc.js"
import { EVENT, harness, id } from "../helpers.js"
import type { Harness, Session } from "../helpers.js"

const hasMosquitto = spawnSync("sh", ["-c", "command -v mosquitto || ls /usr/sbin/mosquitto"]).status === 0
const MOSQUITTO = spawnSync("sh", ["-c", "command -v mosquitto || echo /usr/sbin/mosquitto"]).stdout.toString().trim()

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port
      srv.close(() => resolve(port))
    })
  })
}

const until = async (fn: () => boolean, ms = 5000) => {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error("timed out")
    await new Promise((r) => setTimeout(r, 20))
  }
}

describe.skipIf(!hasMosquitto)("with a real MQTT 5 broker", () => {
  let broker: ChildProcess
  let url: string
  let h: Harness
  let sam: Session
  let conn: MqttConnection
  let client: MqttClient
  const received: Array<{ topic: string; payload: any; props: any; retain: boolean }> = []

  beforeAll(async () => {
    const port = await freePort()
    const dir = mkdtempSync(join(tmpdir(), "mosq-"))
    const conf = join(dir, "m.conf")
    writeFileSync(conf, `listener ${port} 127.0.0.1\nallow_anonymous true\npersistence false\n`)
    broker = spawn(MOSQUITTO, ["-c", conf], { stdio: "ignore" })
    url = `mqtt://127.0.0.1:${port}`
    await new Promise((r) => setTimeout(r, 400))
    h = await harness({ MQTT_URL: url })
    sam = await h.user("sam")
    const rpc = new RpcServer(h.s.guard, (o) => h.app.inject(o), h.ctx.rpcSecret)
    conn = new MqttConnection({
      url,
      clientId: "vscout-api-test",
      username: "vscout-api",
      password: () => h.s.auth.serviceToken("vscout-api", "vscout-api-test"),
      rpc,
      onConnect: () => h.s.publisher.publishStatus(),
    })
    h.s.publisher.attach(conn)
    await conn.start()
    await until(() => conn.connected)
    client = mqtt.connect(url, { protocolVersion: 5, clientId: `vscout-${sam.userId}-${sam.deviceId}`, username: sam.userId, password: sam.token, clean: true })
    client.on("message", (topic, payload, packet) => received.push({ topic, payload: JSON.parse(payload.toString()), props: packet.properties, retain: packet.retain }))
    await new Promise<void>((r) => client.on("connect", () => r()))
    await new Promise<void>((r) =>
      client.subscribe(
        ["vscout/sys/status", `vscout/rpc/res/${sam.userId}/+`, `vscout/event/${EVENT}/data/#`, `vscout/event/${EVENT}/chat/#`, `vscout/user/${sam.userId}/#`],
        { qos: 1 },
        () => r()
      )
    )
  }, 30_000)

  afterAll(async () => {
    client?.end(true)
    await conn?.stop()
    await h?.close()
    broker?.kill()
  })

  it("delivers the retained sys/status", async () => {
    await until(() => received.some((m) => m.topic === "vscout/sys/status"))
    const st = received.find((m) => m.topic === "vscout/sys/status")
    expect(st?.retain).toBe(true)
    expect(st?.payload).toMatchObject({ v: 1, minClientVersion: "2.0.0-alpha.0", maintenance: false })
  })

  it("answers an RPC request on the response topic with the correlation data", async () => {
    const reqId = id()
    client.publish(
      `vscout/rpc/req/${sam.userId}/${sam.deviceId}`,
      JSON.stringify({ v: 1, id: reqId, method: "GET", path: "/me", headers: { Authorization: `Bearer ${sam.token}`, "X-Client-Version": "2.0.0" } }),
      { qos: 1, properties: { responseTopic: `vscout/rpc/res/${sam.userId}/${sam.deviceId}`, correlationData: Buffer.from(reqId), contentType: "application/json", messageExpiryInterval: 8 } }
    )
    await until(() => received.some((m) => m.topic.startsWith("vscout/rpc/res/") && m.payload.id === reqId))
    const res = received.find((m) => m.payload.id === reqId)
    expect(res?.payload).toMatchObject({ v: 1, status: 200, body: { user: { username: "sam" } } })
    expect(Buffer.from(res?.props.correlationData).toString()).toBe(reqId)
    expect(res?.props.messageExpiryInterval).toBe(30)
  })

  it("a write over RPC fans out one envelope with the opId", async () => {
    const key = id()
    const body = { id: id(), channelId: `event:${EVENT}`, kind: "message", body: "over mqtt" }
    client.publish(
      `vscout/rpc/req/${sam.userId}/${sam.deviceId}`,
      JSON.stringify({ v: 1, id: id(), method: "POST", path: `/events/${EVENT}/messages`, headers: { Authorization: `Bearer ${sam.token}`, "Idempotency-Key": key }, body }),
      { qos: 1, properties: { responseTopic: `vscout/rpc/res/${sam.userId}/${sam.deviceId}`, correlationData: Buffer.from("x") } }
    )
    await until(() => received.some((m) => m.topic === `vscout/event/${EVENT}/chat/message` && m.payload.id === body.id))
    const env = received.filter((m) => m.topic === `vscout/event/${EVENT}/chat/message` && m.payload.id === body.id)
    expect(env).toHaveLength(1)
    expect(env[0]?.payload).toMatchObject({ rev: 1, opId: key, entity: "message" })
  })
})
