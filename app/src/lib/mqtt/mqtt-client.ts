// The MQTT connection manager (mqtt.md §3, §4.1, §7): runs the state machine, performs its effects,
// keeps subscriptions in sync with the session and active event, routes messages, and provides the
// RpcLink that lib/api's MqttRpcTransport uses. MQTT never touches React or Dexie directly.
import type { AdminAlert, InboxMessage, SysStatus } from "@/lib/contracts/mqtt"
import { logger } from "@/lib/logger"
import { INITIAL, transition } from "./connection-machine"
import type {
  Effect,
  MachineEvent,
  MachineState,
  MqttState,
} from "./connection-machine"
import { createStore } from "./external-store"
import type { ExternalStore } from "./external-store"
import { createLaneBatcher } from "./lanes"
import type { Lane, LaneOptions } from "./lanes"
import { createPresenceStores } from "./presence-store"
import type { PresenceStores } from "./presence-store"
import { createRouter } from "./router"
import type { RpcLink, RpcPublishProps } from "./rpc-channel"
import { desiredSubscriptions, diffSubscriptions } from "./subscriptions"
import type { SubscriptionIdentity, UiTopics } from "./subscriptions"
import { topics } from "./topics"
import type { MqttTransport, MqttTransportFactory } from "./transport"

export interface MqttStatus {
  state: MqttState
  since: number
  attempt: number
  nextRetryAt?: number
  lastError?: { code?: number; message: string }
  lastConnectedAt?: number
  droppedPayloads: number
  isLeader: boolean
}

export interface MqttSession {
  userId: string
  role: SubscriptionIdentity["role"]
}

export interface MqttDeps {
  transportFactory: MqttTransportFactory
  url: string
  deviceId: string
  appVersion: string
  auth: {
    getSession: () => MqttSession | null
    getAccessToken: () => string | null
    /** single-flight refresh (lib/auth); false when the session is gone */
    refresh: () => Promise<boolean>
  }
  getActiveEventKey: () => string | null
  /** lib/sync/ingest: decode + apply in one transaction */
  ingest: (raws: Array<unknown>, lane: Lane) => Promise<void>
  requestSync: (
    reason: "mqtt-reconnect" | "mqtt-control",
    opts?: { entities?: Array<string> }
  ) => void
  onSysStatus?: (s: SysStatus) => void
  onInbox?: (m: InboxMessage) => void
  onAdminAlert?: (a: AdminAlert) => void
  onReload?: (minClientVersion: string) => void
  /** bytes pushed to this device (live changes, presence); RPC responses are counted by lib/api */
  onTraffic?: (bytes: number) => void
  now?: () => number
  random?: () => number
  lanes?: LaneOptions
}

export interface MqttConnection {
  start: (opts?: { leader?: boolean }) => void
  stop: (opts?: { publishOffline?: boolean }) => Promise<void>
  handle: (event: MachineEvent) => void
  activeEventChanged: () => void
  setUiTopics: (ui: UiTopics) => void
  publishTyping: (channelId: string, state: "typing" | "idle") => void
  status: ExternalStore<MqttStatus>
  presence: PresenceStores
  rpcLink: RpcLink
  rpcTopics: () => { request: string; response: string } | null
  /** wait until queued incoming data is applied (tests, logout) */
  drain: () => Promise<void>
}

const KEEPALIVE_S = 30
const PRESENCE_EXPIRY_S = 86_400
const TYPING_THROTTLE_MS = 3_000

export function createMqttConnection(deps: MqttDeps): MqttConnection {
  const now = deps.now ?? (() => Date.now())
  const random = deps.random ?? Math.random
  let machine: MachineState = INITIAL
  let transport: MqttTransport | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let subscribed = new Set<string>()
  let rpcGranted = false
  let isLeader = false
  let ui: UiTopics = {}
  let presenceEventKey: string | null = null
  const lastTyping = new Map<string, number>()

  const status = createStore<MqttStatus>({
    state: "idle",
    since: now(),
    attempt: 0,
    droppedPayloads: 0,
    isLeader: false,
  })
  const presenceStores = createPresenceStores()
  const responseHandlers = new Set<
    (payload: string, correlationData?: Uint8Array) => void
  >()
  const disconnectHandlers = new Set<() => void>()
  const batcher = createLaneBatcher(
    (raws, lane) => deps.ingest(raws, lane),
    deps.lanes
  )

  const identity = (): SubscriptionIdentity | null => {
    const s = deps.auth.getSession()
    return s
      ? { role: s.role, userId: s.userId, deviceId: deps.deviceId }
      : null
  }
  const canPresence = () => {
    const who = identity()
    return who !== null && who.role !== "guest"
  }

  const router = createRouter({
    userId: () => deps.auth.getSession()?.userId ?? null,
    data: (raw, lane) => batcher.push(lane, raw),
    rpcResponse: (payload, cd) => {
      for (const h of responseHandlers) h(payload, cd)
    },
    control: (msg) => {
      if (msg.cmd === "resync")
        deps.requestSync("mqtt-control", { entities: msg.entities })
      else deps.onReload?.(msg.minClientVersion)
    },
    sysStatus: (s) => deps.onSysStatus?.(s),
    inbox: (m) => {
      if (m.kind === "roleChanged")
        // new role → new token with a new ACL → reconnect with it (mqtt.md §3.3)
        void deps.auth.refresh().then((ok) => {
          if (ok) handle({ type: "RECONNECT" })
        })
      deps.onInbox?.(m)
    },
    adminAlert: (a) => deps.onAdminAlert?.(a),
    presence: presenceStores,
    now,
    onDrop: () =>
      status.update((s) => ({ ...s, droppedPayloads: s.droppedPayloads + 1 })),
  })

  const ensureTransport = (): MqttTransport => {
    if (transport) return transport
    const t = deps.transportFactory()
    t.on("connect", () => handle({ type: "CONNACK_OK" }))
    t.on("connectFailed", (code) => handle({ type: "CONNACK_FAILED", code }))
    t.on("close", () => handle({ type: "CLOSED" }))
    t.on("disconnect", (code) => handle({ type: "DISCONNECT", code }))
    t.on("message", (topic, payload, props) => {
      if (deps.onTraffic && !topic.startsWith("vscout/rpc/"))
        deps.onTraffic(payload.length)
      router(topic, payload, props)
    })
    transport = t
    return t
  }

  const presencePayload = (state: "online" | "away" | "offline") =>
    JSON.stringify({
      v: 1,
      status: state,
      userId: identity()?.userId,
      deviceId: deps.deviceId,
      ts: new Date(now()).toISOString(),
      appVersion: deps.appVersion,
    })

  const publishPresence = async (
    state: "online" | "away" | "offline",
    eventKey: string | null
  ) => {
    const who = identity()
    if (!transport || !who || who.role === "guest" || !eventKey) return
    try {
      await transport.publish(
        topics.presence(eventKey, who.userId, deps.deviceId),
        presencePayload(state),
        {
          qos: state === "away" ? 0 : 1,
          retain: true,
          ...(state === "online"
            ? { properties: { messageExpiryInterval: PRESENCE_EXPIRY_S } }
            : {}),
        }
      )
    } catch (error) {
      logger.info("mqtt", "presence publish failed", { error: String(error) })
    }
  }

  const connect = () => {
    const who = identity()
    const token = deps.auth.getAccessToken()
    if (!who || !token) {
      handle({ type: "CONNACK_FAILED", code: 135 }) // no usable token: same path as an auth failure
      return
    }
    const eventKey = deps.getActiveEventKey()
    presenceEventKey = eventKey
    ensureTransport().connect({
      url: deps.url,
      clientId: `vscout-${who.userId}-${deps.deviceId}`,
      username: who.userId,
      password: token,
      keepalive: KEEPALIVE_S,
      ...(canPresence() && eventKey
        ? {
            will: {
              topic: topics.presence(eventKey, who.userId, deps.deviceId),
              payload: JSON.stringify({
                v: 1,
                status: "offline",
                userId: who.userId,
                deviceId: deps.deviceId,
                reason: "lwt",
              }),
              qos: 1 as const,
              retain: true,
            },
          }
        : {}),
    })
  }

  /** Subscribe one filter per call: a denied SUBACK must not fail the rest (mqtt.md §4.1). */
  const syncSubscriptions = async (full: boolean) => {
    const who = identity()
    const t = transport
    if (!who || !t) return
    const desired = desiredSubscriptions(who, deps.getActiveEventKey(), ui)
    if (full) subscribed = new Set()
    const { add, remove } = diffSubscriptions(subscribed, desired)
    for (const filter of remove) {
      subscribed.delete(filter)
      await t.unsubscribe(filter).catch(() => undefined)
    }
    for (const filter of add) {
      const granted = await t.subscribe(filter, 1)
      if (granted >= 128) {
        logger.warn("mqtt", "subscription denied", { filter, granted })
        continue
      }
      subscribed.add(filter)
      if (filter === topics.rpcResponse(who.userId, deps.deviceId))
        rpcGranted = true
    }
  }

  const rejectRpc = () => {
    rpcGranted = false
    for (const h of disconnectHandlers) h()
  }

  const clearRetry = () => {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
  }

  function run(effects: ReadonlyArray<Effect>): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "connect":
          connect()
          break
        case "hardReconnect":
          rejectRpc()
          transport?.destroy()
          connect()
          break
        case "end":
          subscribed = new Set()
          if (effect.force) transport?.destroy()
          else void transport?.end()
          break
        case "scheduleRetry":
          clearRetry()
          status.update((s) => ({ ...s, nextRetryAt: now() + effect.delayMs }))
          retryTimer = setTimeout(
            () => handle({ type: "RETRY_TIMER" }),
            effect.delayMs
          )
          break
        case "cancelRetry":
          clearRetry()
          break
        case "refreshToken":
          void deps.auth
            .refresh()
            .then((ok) =>
              handle({ type: ok ? "REFRESH_OK" : "REFRESH_FAILED" })
            )
          break
        case "updatePassword": {
          const token = deps.auth.getAccessToken()
          if (token) transport?.setPassword(token)
          break
        }
        case "resubscribeAll":
          void syncSubscriptions(true)
          break
        case "publishPresence":
          void publishPresence(effect.status, deps.getActiveEventKey())
          break
        case "requestSync":
          deps.requestSync(effect.reason)
          break
        case "rejectRpc":
          rejectRpc()
          break
      }
    }
  }

  function handle(event: MachineEvent): void {
    const { next, effects } = transition(machine, event, random)
    const changed =
      next.state !== machine.state || next.attempt !== machine.attempt
    machine = next
    if (changed)
      status.update((s) => ({
        ...s,
        state: next.state,
        attempt: next.attempt,
        since: next.state !== s.state ? now() : s.since,
        ...(next.state === "connected"
          ? { lastConnectedAt: now(), nextRetryAt: undefined }
          : {}),
      }))
    run(effects)
  }

  const rpcLink: RpcLink = {
    isReady: () => machine.state === "connected" && rpcGranted,
    publish: async (topic: string, payload: string, props: RpcPublishProps) => {
      if (!transport) throw new Error("not connected")
      await transport.publish(topic, payload, { qos: 1, properties: props })
    },
    onResponse: (h) => {
      responseHandlers.add(h)
      return () => responseHandlers.delete(h)
    },
    onDisconnect: (h) => {
      disconnectHandlers.add(h)
      return () => disconnectHandlers.delete(h)
    },
  }

  return {
    start(opts = {}) {
      isLeader = opts.leader ?? true
      status.update((s) => ({ ...s, isLeader }))
      handle({ type: "START", leader: isLeader })
    },
    async stop(opts = {}) {
      if ((opts.publishOffline ?? true) && machine.state === "connected")
        await publishPresence("offline", presenceEventKey)
      handle({ type: "STOP" })
      await batcher.drain()
      presenceStores.clear()
    },
    handle,
    activeEventChanged() {
      if (machine.state !== "connected") return
      // the will names the event, so switching events reconnects (mqtt.md §10)
      void publishPresence("offline", presenceEventKey).then(() => {
        presenceStores.clear()
        handle({ type: "RECONNECT" })
      })
    },
    setUiTopics(next) {
      ui = next
      if (machine.state === "connected") void syncSubscriptions(false)
    },
    publishTyping(channelId, state) {
      const who = identity()
      const eventKey = deps.getActiveEventKey()
      if (
        !transport ||
        machine.state !== "connected" ||
        !who ||
        who.role === "guest" ||
        !eventKey
      )
        return
      const last = lastTyping.get(channelId) ?? -Infinity
      if (state === "typing" && now() - last < TYPING_THROTTLE_MS) return
      lastTyping.set(channelId, state === "typing" ? now() : -Infinity)
      void transport
        .publish(
          topics.typing(eventKey, channelId, who.userId),
          JSON.stringify({
            v: 1,
            channelId,
            userId: who.userId,
            state,
            ts: new Date(now()).toISOString(),
          }),
          { qos: 0 }
        )
        .catch(() => undefined)
    },
    status,
    presence: presenceStores,
    rpcLink,
    rpcTopics() {
      const who = identity()
      return who
        ? {
            request: topics.rpcRequest(who.userId, deps.deviceId),
            response: topics.rpcResponse(who.userId, deps.deviceId),
          }
        : null
    },
    drain: () => batcher.drain(),
  }
}
