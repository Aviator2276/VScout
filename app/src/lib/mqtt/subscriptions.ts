// Subscriptions are derived state (mqtt.md §4.1): desired set per role, diffed against the current.
import { topics } from "./topics"

export interface SubscriptionIdentity {
  role: "admin" | "scouter" | "guest"
  userId: string
  deviceId: string
}

export interface UiTopics {
  /** the open chat thread's typing indicators */
  typingChannel?: string | null
}

/** Ordered: the RPC response topic first, so RPC is usable as early as possible. */
export function desiredSubscriptions(
  who: SubscriptionIdentity,
  eventKey: string | null,
  ui: UiTopics = {}
): Array<string> {
  const subs = [
    topics.rpcResponse(who.userId, who.deviceId),
    topics.sysStatus(),
    topics.globalData(),
    topics.userAll(who.userId),
  ]
  if (!eventKey) return subs
  subs.push(topics.eventData(eventKey), topics.eventControl(eventKey))
  if (who.role === "guest") return subs // no chat, presence or typing (ADR-066)
  subs.push(topics.eventChat(eventKey), topics.presenceAll(eventKey))
  if (who.role === "admin") subs.push(topics.adminAlerts(eventKey))
  if (ui.typingChannel) subs.push(topics.typingIn(eventKey, ui.typingChannel))
  return subs
}

export function diffSubscriptions(
  current: ReadonlySet<string>,
  desired: ReadonlyArray<string>
): { add: Array<string>; remove: Array<string> } {
  const want = new Set(desired)
  return {
    add: desired.filter((t) => !current.has(t)),
    remove: [...current].filter((t) => !want.has(t)),
  }
}
