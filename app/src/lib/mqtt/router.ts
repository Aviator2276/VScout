// Every incoming message: topic → route → validation → consistency check → handler (mqtt.md §6–7).
// Any failure is dropped and counted; nothing invalid reaches Dexie or a store.
import {
  adminAlert,
  controlMessage,
  inboxMessage,
  presence,
  sysStatus,
  typing,
} from "@/lib/contracts/mqtt"
import type {
  AdminAlert,
  ControlMessage,
  InboxMessage,
  SysStatus,
} from "@/lib/contracts/mqtt"
import { logger } from "@/lib/logger"
import type { Lane } from "./lanes"
import type { PresenceStores } from "./presence-store"
import { parseTopic } from "./topics"
import type { TopicRoute } from "./topics"

export const MAX_FANOUT_BYTES = 256 * 1024
export const MAX_RPC_BYTES = 1024 * 1024

export interface RouterHandlers {
  /** session identity, for user-scope checks */
  userId: () => string | null
  data: (raw: unknown, lane: Lane) => void
  rpcResponse: (payload: string, correlationData?: Uint8Array) => void
  control: (msg: ControlMessage) => void
  sysStatus: (msg: SysStatus) => void
  inbox: (msg: InboxMessage) => void
  adminAlert: (msg: AdminAlert) => void
  presence: PresenceStores
  now: () => number
  onDrop: (reason: string, topic: string) => void
}

const URGENT_ENTITIES = new Set<string>([]) // urgency comes from message kind and scope, below
const NORMAL_ENTITIES = new Set([
  "message",
  "reaction",
  "comment",
  "match",
  "picklist",
  "picklistEntry",
  "allianceBoard",
  "eventSettings",
  "teamSettings",
  "userSettings",
])

/** Priority lane of a data envelope (mqtt.md §8.2). */
export function laneFor(
  route: Extract<TopicRoute, { kind: "data" }>,
  env: Record<string, unknown>
): Lane {
  const data = env.data as { kind?: unknown } | undefined
  if (
    route.entity === "message" &&
    (route.scope === "user" || data?.kind === "announcement")
  )
    return "urgent"
  if (URGENT_ENTITIES.has(route.entity)) return "urgent"
  return NORMAL_ENTITIES.has(route.entity) ? "normal" : "bulk"
}

const decoder = new TextDecoder()

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

export function createRouter(h: RouterHandlers) {
  const drop = (reason: string, topic: string) => {
    h.onDrop(reason, topic)
    logger.debug("mqtt", `dropped: ${reason}`, { topic })
  }

  const checkData = (
    route: Extract<TopicRoute, { kind: "data" }>,
    env: Record<string, unknown>
  ): string | null => {
    if (env.entity !== route.entity) return "entity-mismatch"
    if (
      (route.scope === "event" || route.scope === "chat") &&
      env.eventKey !== route.eventKey
    )
      return "event-mismatch"
    if (route.scope === "chat" && route.entity === "message") {
      const data = env.data as { kind?: unknown } | undefined
      if (env.op === "upsert" && data?.kind !== "message")
        return "chat-kind-mismatch"
    }
    if (route.scope === "user" && route.userId !== h.userId())
      return "user-mismatch"
    return null
  }

  return function dispatch(
    topic: string,
    payload: Uint8Array,
    props: { correlationData?: Uint8Array } = {}
  ) {
    const route = parseTopic(topic)
    if (!route) return drop("unknown-topic", topic)
    const limit =
      route.kind === "rpcResponse" ? MAX_RPC_BYTES : MAX_FANOUT_BYTES
    if (payload.byteLength > limit) return drop("too-large", topic)
    const text = decoder.decode(payload)

    if (route.kind === "rpcResponse") {
      // never batched, never touches Dexie (mqtt.md §9.3)
      h.rpcResponse(text, props.correlationData)
      return
    }
    if (text === "") return // cleared retained message (e.g. presence)
    const json = parseJson(text)
    if (json === undefined) return drop("bad-json", topic)

    switch (route.kind) {
      case "data": {
        if (typeof json !== "object" || json === null)
          return drop("bad-envelope", topic)
        const env = json as Record<string, unknown>
        const mismatch = checkData(route, env)
        if (mismatch) return drop(mismatch, topic)
        h.data(env, laneFor(route, env))
        return
      }
      case "control": {
        const r = controlMessage.safeParse(json)
        if (!r.success) return drop("bad-control", topic)
        h.control(r.data)
        return
      }
      case "sysStatus": {
        const r = sysStatus.safeParse(json)
        if (!r.success) return drop("bad-sys-status", topic)
        h.sysStatus(r.data)
        return
      }
      case "inbox": {
        if (route.userId !== h.userId()) return drop("user-mismatch", topic)
        const r = inboxMessage.safeParse(json)
        if (!r.success) return drop("bad-inbox", topic)
        h.inbox(r.data)
        return
      }
      case "adminAlert": {
        const r = adminAlert.safeParse(json)
        if (!r.success) return drop("bad-admin-alert", topic)
        h.adminAlert(r.data)
        return
      }
      case "presence": {
        const r = presence.safeParse(json)
        if (
          !r.success ||
          r.data.userId !== route.userId ||
          r.data.deviceId !== route.deviceId
        )
          return drop("bad-presence", topic)
        h.presence.setPresence(route.eventKey, r.data, h.now())
        return
      }
      case "typing": {
        const r = typing.safeParse(json)
        if (!r.success || r.data.userId !== route.userId)
          return drop("bad-typing", topic)
        h.presence.setTyping(
          route.channelId,
          route.userId,
          r.data.state,
          h.now()
        )
        return
      }
    }
  }
}
