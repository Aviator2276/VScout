// The API's own MQTT 5 connection (REQUIREMENTS §9.1): a service account that publishes fan-out,
// answers RPC on a shared subscription, reconnects forever and refreshes its token each time.
import mqtt from "mqtt"
import type { MqttClient } from "mqtt"
import type { MqttLink, PublishOptions } from "./publisher.js"
import type { RpcServer } from "./rpc.js"

export interface MqttLinkOptions {
  url: string
  clientId: string
  username: string
  password: () => Promise<string>
  rpc: RpcServer | null
  onConnect?: () => void
  log?: (msg: string, err?: unknown) => void
}

export const RPC_SHARED_SUB = "$share/api/vscout/rpc/req/+/+"

export class MqttConnection implements MqttLink {
  private client: MqttClient | null = null

  constructor(private o: MqttLinkOptions) {}

  get connected() {
    return this.client?.connected === true
  }

  async start(): Promise<void> {
    const log = this.o.log ?? (() => {})
    const client = mqtt.connect(this.o.url, {
      protocolVersion: 5,
      clientId: this.o.clientId,
      username: this.o.username,
      password: await this.o.password(),
      clean: true,
      keepalive: 30,
      reconnectPeriod: 2000,
      connectTimeout: 10_000,
      resubscribe: true,
      queueQoSZero: false,
      properties: { sessionExpiryInterval: 0, maximumPacketSize: 4 * 1024 * 1024 },
    })
    this.client = client
    client.on("connect", () => {
      log("mqtt connected")
      if (this.o.rpc) client.subscribe(RPC_SHARED_SUB, { qos: 1 }, (err) => err && log("rpc subscribe failed", err))
      this.o.onConnect?.()
    })
    client.on("error", (err) => log("mqtt error", err.message))
    client.on("close", () => {
      // a fresh token for the next attempt (the broker disconnects expired ones)
      void this.o.password().then((p) => {
        client.options.password = p
      })
    })
    client.on("message", (topic, payload, packet) => {
      const rpc = this.o.rpc
      if (!rpc || !topic.startsWith("vscout/rpc/req/")) return
      const corr = packet.properties?.correlationData
      void rpc
        .handle(topic, payload, corr)
        .then((reply) => {
          if (!reply) return
          return this.publish(reply.topic, reply.payload, {
            qos: 1,
            properties: {
              ...(reply.correlationData ? { correlationData: reply.correlationData } : {}),
              contentType: "application/json",
              messageExpiryInterval: 30,
            },
          })
        })
        .catch((e: unknown) => log("rpc handling failed", e))
    })
  }

  publish(topic: string, payload: string | Buffer, opts: PublishOptions): Promise<void> {
    const client = this.client
    if (!client) return Promise.reject(new Error("not connected"))
    return new Promise((resolve, reject) =>
      client.publish(
        topic,
        payload,
        { qos: opts.qos, retain: opts.retain ?? false, ...(opts.properties ? { properties: opts.properties } : {}) },
        (err) => (err ? reject(err) : resolve())
      )
    )
  }

  async stop(): Promise<void> {
    const c = this.client
    if (!c) return
    await new Promise<void>((r) => c.end(false, {}, () => r()))
  }
}
