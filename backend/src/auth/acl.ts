// MQTT access control (REQUIREMENTS §9.3, default deny). The same rules are put in the token's
// `acl` claim for EMQX and answered by the HTTP authorization hook for brokers that call back.
import type { TokenRole } from "./tokens.js"

export interface AclRule {
  permission: "allow" | "deny"
  action: "publish" | "subscribe" | "all"
  topic: string
}

const sub = (topic: string): AclRule => ({ permission: "allow", action: "subscribe", topic })
const pub = (topic: string): AclRule => ({ permission: "allow", action: "publish", topic })

/**
 * Rules for one user. Guests are narrowed to their own event (`ek`); staff use `+` for every event.
 */
export function aclFor(userId: string, role: TokenRole, guestEventKey?: string): AclRule[] {
  if (role === "service")
    return [{ permission: "allow", action: "all", topic: "#" }]
  const ev = role === "guest" && guestEventKey ? guestEventKey : "+"
  const rules: AclRule[] = [
    sub("vscout/sys/status"),
    sub("vscout/global/data/#"),
    sub(`vscout/event/${ev}/data/#`),
    sub(`vscout/event/${ev}/control`),
    sub(`vscout/user/${userId}/#`),
    pub(`vscout/rpc/req/${userId}/+`),
    sub(`vscout/rpc/res/${userId}/+`),
  ]
  if (role === "admin" || role === "scouter") {
    rules.push(
      sub("vscout/event/+/chat/#"),
      sub("vscout/event/+/presence/#"),
      pub(`vscout/event/+/presence/${userId}/+`),
      sub("vscout/event/+/typing/+/+"),
      pub(`vscout/event/+/typing/+/${userId}`)
    )
  }
  if (role === "admin") rules.push(sub("vscout/event/+/admin/#"))
  rules.push({ permission: "deny", action: "all", topic: "#" })
  return rules
}

/** MQTT topic filter match (`+` one level, `#` the rest). Filters in rules may hold wildcards. */
export function topicMatches(filter: string, topic: string): boolean {
  const f = filter.split("/")
  const t = topic.split("/")
  for (let i = 0; i < f.length; i++) {
    const part = f[i]
    if (part === "#") return true
    if (i >= t.length) return false
    if (part !== "+" && part !== t[i]) return false
  }
  return f.length === t.length
}

/**
 * Is `topic` (a concrete publish topic, or a subscription filter) allowed? A subscription filter
 * is allowed only if every topic it could match is allowed by one rule, which we check by matching
 * the filter itself against the rule as if it were a topic (wildcards must line up).
 */
export function isAllowed(rules: AclRule[], action: "publish" | "subscribe", topic: string): boolean {
  let t = topic
  const shared = /^\$share\/[^/]+\/(.+)$/.exec(t)
  if (shared) t = shared[1] as string
  for (const r of rules) {
    if (r.action !== "all" && r.action !== action) continue
    if (filterCovers(r.topic, t)) return r.permission === "allow"
  }
  return false
}

/** Does rule filter `rule` cover every topic matched by `filter`? */
function filterCovers(rule: string, filter: string): boolean {
  const r = rule.split("/")
  const f = filter.split("/")
  for (let i = 0; i < r.length; i++) {
    const rp = r[i]
    if (rp === "#") return true
    const fp = f[i]
    if (fp === undefined) return false
    if (fp === "#") return false
    if (rp === "+") {
      continue
    }
    if (fp === "+" || rp !== fp) return false
  }
  return r.length === f.length
}
