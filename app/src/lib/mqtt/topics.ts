// Every MQTT topic string comes from here (mqtt.md §4). No feature code concatenates topics.
export const topics = {
  sysStatus: () => "vscout/sys/status",
  globalData: () => "vscout/global/data/#",
  eventData: (ek: string) => `vscout/event/${ek}/data/#`,
  /** admin and scouter only (ADR-066) */
  eventChat: (ek: string) => `vscout/event/${ek}/chat/#`,
  eventControl: (ek: string) => `vscout/event/${ek}/control`,
  presence: (ek: string, userId: string, deviceId: string) =>
    `vscout/event/${ek}/presence/${userId}/${deviceId}`,
  presenceAll: (ek: string) => `vscout/event/${ek}/presence/#`,
  typing: (ek: string, channelId: string, userId: string) =>
    `vscout/event/${ek}/typing/${channelId}/${userId}`,
  typingIn: (ek: string, channelId: string) =>
    `vscout/event/${ek}/typing/${channelId}/+`,
  adminAlerts: (ek: string) => `vscout/event/${ek}/admin/alerts`,
  userAll: (userId: string) => `vscout/user/${userId}/#`,
  rpcRequest: (userId: string, deviceId: string) =>
    `vscout/rpc/req/${userId}/${deviceId}`,
  rpcResponse: (userId: string, deviceId: string) =>
    `vscout/rpc/res/${userId}/${deviceId}`,
} as const

export type DataScope = "global" | "event" | "chat" | "user"

export type TopicRoute =
  | { kind: "sysStatus" }
  | {
      kind: "data"
      scope: DataScope
      entity: string
      eventKey?: string
      userId?: string
    }
  | { kind: "control"; eventKey: string }
  | { kind: "presence"; eventKey: string; userId: string; deviceId: string }
  | { kind: "typing"; eventKey: string; channelId: string; userId: string }
  | { kind: "adminAlert"; eventKey: string }
  | { kind: "inbox"; userId: string }
  | { kind: "rpcResponse"; userId: string; deviceId: string }

const EVENT_KEY = /^\d{4}[a-z0-9]+$/
const SEGMENT = /^[^/#+]+$/

/** A concrete topic → typed route; null for anything unexpected (dropped and counted). */
export function parseTopic(topic: string): TopicRoute | null {
  const p = topic.split("/")
  if (p[0] !== "vscout" || p.some((s) => !SEGMENT.test(s))) return null
  const [, a, b, c, d, e, f] = p
  if (a === "sys" && b === "status" && p.length === 3)
    return { kind: "sysStatus" }
  if (a === "global" && b === "data" && c && p.length === 4)
    return { kind: "data", scope: "global", entity: c }
  if (a === "user" && b && p.length === 4 && c === "inbox")
    return { kind: "inbox", userId: b }
  if (a === "user" && b && c === "data" && d && p.length === 5)
    return { kind: "data", scope: "user", userId: b, entity: d }
  if (a === "rpc" && b === "res" && c && d && p.length === 5)
    return { kind: "rpcResponse", userId: c, deviceId: d }
  if (a !== "event" || !b || !EVENT_KEY.test(b)) return null
  if ((c === "data" || c === "chat") && d && p.length === 5)
    return {
      kind: "data",
      scope: c === "data" ? "event" : "chat",
      eventKey: b,
      entity: d,
    }
  if (c === "control" && p.length === 4) return { kind: "control", eventKey: b }
  if (c === "presence" && d && e && p.length === 6)
    return { kind: "presence", eventKey: b, userId: d, deviceId: e }
  if (c === "typing" && d && e && p.length === 6)
    return { kind: "typing", eventKey: b, channelId: d, userId: e }
  if (c === "admin" && d === "alerts" && p.length === 5)
    return { kind: "adminAlert", eventKey: b }
  void f
  return null
}
