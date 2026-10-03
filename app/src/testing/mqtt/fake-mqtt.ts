// An in-memory MQTT broker implementing the MqttTransport factory (mqtt.md §12): topic matching
// with + and #, retained messages, last will on an unclean close, per-test ACL (SUBACK/PUBACK 135),
// CONNACK failure injection, server DISCONNECT injection, takeover (142) and RPC answered from the
// MSW handlers. Delivery is asynchronous (microtasks); await settle() in tests.
import type {
  ConnectOptions,
  MqttTransport,
  PublishOptions,
  TransportEvents,
} from "@/lib/mqtt/transport"
import { answerRpc } from "./fake-broker"

export function topicMatches(filter: string, topic: string): boolean {
  const f = filter.split("/")
  const t = topic.split("/")
  for (let i = 0; i < f.length; i++) {
    if (f[i] === "#") return true
    if (i >= t.length) return false
    if (f[i] !== "+" && f[i] !== t[i]) return false
  }
  return f.length === t.length
}

export const settle = async (rounds = 5) => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0))
}

const encoder = new TextEncoder()

export interface PublishedMessage {
  from: string
  topic: string
  payload: string
  qos: 0 | 1
  retain: boolean
  properties?: PublishOptions["properties"]
}

class FakeClient implements MqttTransport {
  options: ConnectOptions | null = null
  readonly subs = new Set<string>()
  private handlers: Partial<{
    [TEvent in keyof TransportEvents]: TransportEvents[TEvent]
  }> = {}
  connected = false

  constructor(private readonly broker: FakeMqttBroker) {}

  emit<TEvent extends keyof TransportEvents>(
    event: TEvent,
    ...args: Parameters<TransportEvents[TEvent]>
  ) {
    const h = this.handlers[event] as
      ((...a: Parameters<TransportEvents[TEvent]>) => void) | undefined
    h?.(...args)
  }

  on<TEvent extends keyof TransportEvents>(
    event: TEvent,
    handler: TransportEvents[TEvent]
  ) {
    this.handlers[event] = handler as never
  }

  connect(opts: ConnectOptions) {
    this.options = opts
    queueMicrotask(() => this.broker.accept(this))
  }

  setPassword(password: string) {
    if (this.options) this.options = { ...this.options, password }
  }

  destroy() {
    if (this.connected) this.broker.unclean(this)
    this.connected = false
  }

  async end() {
    this.broker.remove(this)
    this.connected = false
    await Promise.resolve()
  }

  subscribe(filter: string): Promise<number> {
    if (!this.connected || !this.options) return Promise.resolve(128)
    if (!this.broker.allow(this.options.clientId, "sub", filter))
      return Promise.resolve(135)
    this.subs.add(filter)
    this.broker.deliverRetained(this, filter)
    return Promise.resolve(1)
  }

  unsubscribe(filter: string): Promise<void> {
    this.subs.delete(filter)
    return Promise.resolve()
  }

  publish(topic: string, payload: string, opts: PublishOptions): Promise<void> {
    if (!this.connected || !this.options)
      return Promise.reject(new Error("not connected"))
    if (!this.broker.allow(this.options.clientId, "pub", topic))
      return opts.qos === 1
        ? Promise.reject(Object.assign(new Error("PUBACK 135"), { code: 135 }))
        : Promise.resolve()
    this.broker.route(this.options.clientId, topic, payload, opts)
    return Promise.resolve()
  }
}

export class FakeMqttBroker {
  readonly published: Array<PublishedMessage> = []
  readonly retained = new Map<string, string>()
  private readonly clients = new Map<string, FakeClient>()
  private acl: (
    clientId: string,
    action: "sub" | "pub",
    topic: string
  ) => boolean = () => true
  private nextConnectReject: number | null = null
  private serving = false
  dropRpcResponses = false
  /** every client ever created, newest last */
  readonly created: Array<FakeClient> = []

  readonly factory = (): MqttTransport => {
    const c = new FakeClient(this)
    this.created.push(c)
    return c
  }

  setAcl(
    fn: (clientId: string, action: "sub" | "pub", topic: string) => boolean
  ) {
    this.acl = fn
  }
  allow(clientId: string, action: "sub" | "pub", topic: string) {
    return this.acl(clientId, action, topic)
  }
  rejectNextConnect(code: 134 | 135) {
    this.nextConnectReject = code
  }
  serveRpc() {
    this.serving = true
  }
  clientIds() {
    return [...this.clients.keys()]
  }
  subscriptions(clientId: string) {
    return [...(this.clients.get(clientId)?.subs ?? [])]
  }
  lastPassword(clientId: string) {
    return this.clients.get(clientId)?.options?.password
  }

  accept(c: FakeClient) {
    if (!c.options) return
    if (this.nextConnectReject !== null) {
      const code = this.nextConnectReject
      this.nextConnectReject = null
      c.emit("connectFailed", code)
      return
    }
    const existing = this.clients.get(c.options.clientId)
    if (existing && existing !== c) {
      existing.connected = false
      existing.emit("disconnect", 142) // session taken over
    }
    c.connected = true
    c.subs.clear()
    this.clients.set(c.options.clientId, c)
    c.emit("connect")
  }

  remove(c: FakeClient) {
    if (c.options && this.clients.get(c.options.clientId) === c)
      this.clients.delete(c.options.clientId)
  }

  /** socket died without DISCONNECT: the will fires */
  unclean(c: FakeClient) {
    this.remove(c)
    const will = c.options?.will
    if (will)
      this.route("$broker", will.topic, will.payload, {
        qos: will.qos,
        retain: will.retain,
      })
  }

  /** the client's network died: will fires and the client sees a close */
  drop(clientId: string) {
    const c = this.clients.get(clientId)
    if (!c) return
    c.connected = false
    this.unclean(c)
    c.emit("close")
  }

  /** server DISCONNECT with a reason code */
  kick(clientId: string, reasonCode: number) {
    const c = this.clients.get(clientId)
    if (!c) return
    c.connected = false
    this.remove(c)
    c.emit("disconnect", reasonCode)
  }

  publishFromServer(
    topic: string,
    payload: unknown,
    opts: { qos?: 0 | 1; retain?: boolean } = {}
  ) {
    this.route(
      "$server",
      topic,
      typeof payload === "string" ? payload : JSON.stringify(payload),
      {
        qos: opts.qos ?? 1,
        retain: opts.retain ?? false,
      }
    )
  }

  deliverRetained(c: FakeClient, filter: string) {
    for (const [topic, payload] of this.retained)
      if (topicMatches(filter, topic))
        queueMicrotask(() =>
          c.emit("message", topic, encoder.encode(payload), {})
        )
  }

  route(from: string, topic: string, payload: string, opts: PublishOptions) {
    this.published.push({
      from,
      topic,
      payload,
      qos: opts.qos,
      retain: opts.retain ?? false,
      properties: opts.properties,
    })
    if (opts.retain) {
      if (payload === "") this.retained.delete(topic)
      else this.retained.set(topic, payload)
    }
    if (
      this.serving &&
      topic.startsWith("vscout/rpc/req/") &&
      opts.properties?.responseTopic
    ) {
      const { responseTopic, correlationData } = opts.properties
      void answerRpc(payload).then((response) => {
        if (this.dropRpcResponses) return
        this.deliver(responseTopic, response, correlationData)
      })
      return
    }
    this.deliver(topic, payload)
  }

  private deliver(
    topic: string,
    payload: string,
    correlationData?: Uint8Array
  ) {
    for (const c of this.clients.values())
      if (c.connected && [...c.subs].some((f) => topicMatches(f, topic)))
        queueMicrotask(() =>
          c.emit(
            "message",
            topic,
            encoder.encode(payload),
            correlationData ? { correlationData } : {}
          )
        )
  }
}
