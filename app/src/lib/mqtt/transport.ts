// What the connection manager needs from an MQTT client (mqtt.md §10). Production wraps mqtt.js
// (lazy-loaded: ~105 KB gz); tests use testing/mqtt/fake-mqtt.ts.
import type { IClientPublishOptions, MqttClient } from "mqtt"

export interface WillMessage {
  topic: string
  payload: string
  qos: 0 | 1
  retain: boolean
}

export interface ConnectOptions {
  url: string
  clientId: string
  username: string
  password: string
  keepalive: number
  will?: WillMessage
}

export interface PublishOptions {
  qos: 0 | 1
  retain?: boolean
  properties?: {
    messageExpiryInterval?: number
    responseTopic?: string
    correlationData?: Uint8Array
    contentType?: string
  }
}

export interface TransportEvents {
  connect: () => void
  connectFailed: (reasonCode: number) => void
  close: () => void
  disconnect: (reasonCode: number) => void
  message: (
    topic: string,
    payload: Uint8Array,
    props: { correlationData?: Uint8Array }
  ) => void
}

export interface MqttTransport {
  connect: (opts: ConnectOptions) => void
  setPassword: (password: string) => void
  /** close the socket without a clean DISCONNECT (hard reconnect, leader loss) */
  destroy: () => void
  end: () => Promise<void>
  /** granted QoS, or a reason code ≥ 128 when denied */
  subscribe: (filter: string, qos: 0 | 1) => Promise<number>
  unsubscribe: (filter: string) => Promise<void>
  publish: (
    topic: string,
    payload: string,
    opts: PublishOptions
  ) => Promise<void>
  on: <TEvent extends keyof TransportEvents>(
    event: TEvent,
    handler: TransportEvents[TEvent]
  ) => void
}

export type MqttTransportFactory = () => MqttTransport

/**
 * mqtt.js types binary properties as Buffer. Node has it; the browser bundle polyfills it but
 * doesn't expose a global, and Buffer is a Uint8Array subclass, so pass the bytes through.
 * [unverified in the browser build: check in the Phase 1 gate e2e]
 */
function toBinary(bytes: Uint8Array): Buffer {
  const B = (globalThis as { Buffer?: typeof Buffer }).Buffer
  return B ? B.from(bytes) : (bytes as Buffer)
}

/** CONNACK/DISCONNECT reason codes we read from mqtt.js errors (MQTT 5). */
function reasonOf(error: unknown): number {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === "number" ? code : 128
}

/** mqtt.js 5 behind the transport interface. Verified options: mqtt.md §10. */
export function mqttJsTransportFactory(): MqttTransportFactory {
  return () => {
    const handlers: Partial<{
      [TEvent in keyof TransportEvents]: TransportEvents[TEvent]
    }> = {}
    let client: MqttClient | null = null
    let connected = false

    const transport: MqttTransport = {
      connect(opts) {
        void import("mqtt").then(({ default: mqtt }) => {
          client?.end(true)
          connected = false
          const c = mqtt.connect(opts.url, {
            protocolVersion: 5,
            clientId: opts.clientId,
            username: opts.username,
            password: opts.password,
            clean: true,
            keepalive: opts.keepalive,
            reconnectPeriod: 0, // our state machine owns reconnects
            connectTimeout: 10_000,
            resubscribe: false,
            queueQoSZero: false,
            properties: { maximumPacketSize: 1_048_576 },
            ...(opts.will ? { will: opts.will } : {}),
          })
          client = c
          c.on("connect", () => {
            connected = true
            handlers.connect?.()
          })
          c.on("error", (err) => {
            if (!connected) handlers.connectFailed?.(reasonOf(err))
          })
          c.on("disconnect", (packet) =>
            handlers.disconnect?.(packet.reasonCode ?? 0)
          )
          c.on("close", () => {
            if (connected) handlers.close?.()
            connected = false
          })
          c.on("message", (topic, payload, packet) => {
            const cd = packet.properties?.correlationData
            handlers.message?.(
              topic,
              payload,
              cd ? { correlationData: new Uint8Array(cd) } : {}
            )
          })
        })
      },
      setPassword(password) {
        if (client) client.options.password = password
      },
      destroy() {
        connected = false
        client?.end(true)
        client = null
      },
      async end() {
        await client?.endAsync(false)
        client = null
        connected = false
      },
      async subscribe(filter, qos) {
        if (!client) return 128
        try {
          const granted = await client.subscribeAsync(filter, { qos })
          return granted[0]?.qos ?? 128
        } catch (error) {
          return reasonOf(error) >= 128 ? reasonOf(error) : 128
        }
      },
      async unsubscribe(filter) {
        await client?.unsubscribeAsync(filter)
      },
      async publish(topic, payload, opts) {
        if (!client) throw new Error("not connected")
        const { correlationData, ...props } = opts.properties ?? {}
        const options: IClientPublishOptions = {
          qos: opts.qos,
          retain: opts.retain ?? false,
          properties: {
            ...props,
            ...(correlationData
              ? { correlationData: toBinary(correlationData) }
              : {}),
          },
        }
        await client.publishAsync(topic, payload, options)
      },
      on(event, handler) {
        handlers[event] = handler as never
      },
    }
    return transport
  }
}
