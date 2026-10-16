// Who may read a record, as change-log targets (REQUIREMENTS §6.1 rule 5, §9.5). The same targets
// drive /sync/changes filtering, MQTT topics and the SSE stream, so the three never disagree.
import type { EntityName } from "./entities.js"

export type Audience = "all" | "staff"

/**
 * scope: `global` | `users` (the user directory, part of everyone's user scope) |
 *        `user:<id>` (one user's private records) | `event:<eventKey>`
 * audience `staff` hides the row from guests (event chat and chat reactions).
 * excludeUser hides the row from one user who still reads the record through another target.
 */
export interface LogTarget {
  scope: string
  audience: Audience
  excludeUser?: string
}

export interface Viewer {
  id: string
  role: "admin" | "scouter" | "guest" | "service"
}

/** Looks up a message (live or deleted) so reactions can follow their target's visibility. */
export type MessageLookup = (id: string) => Record<string, unknown> | undefined

export function dmParticipants(channelId: string): [string, string] | null {
  const m = /^dm:([^:]+):([^:]+)$/.exec(channelId)
  return m ? [m[1] as string, m[2] as string] : null
}

function messageTargets(msg: Record<string, unknown>): LogTarget[] {
  const channel = String(msg.channelId ?? "")
  const dm = dmParticipants(channel)
  if (dm) return [...new Set(dm)].map((u) => ({ scope: `user:${u}`, audience: "all" as const }))
  const scope = `event:${String(msg.eventKey)}`
  return [{ scope, audience: msg.kind === "announcement" ? "all" : "staff" }]
}

export function targetsFor(
  entity: EntityName,
  rec: Record<string, unknown>,
  lookupMessage: MessageLookup
): LogTarget[] {
  switch (entity) {
    case "event":
    case "team":
    case "teamSettings":
      return [{ scope: "global", audience: "all" }]
    case "user":
      return [{ scope: "users", audience: "all" }]
    case "userSettings":
      return [{ scope: `user:${String(rec.userId ?? rec.id)}`, audience: "all" }]
    case "comment":
      return rec.visibility === "private"
        ? [{ scope: `user:${String(rec.authorId)}`, audience: "all" }]
        : [{ scope: `event:${String(rec.eventKey)}`, audience: "all" }]
    case "message":
      return messageTargets(rec)
    case "reaction": {
      const target = lookupMessage(String(rec.targetId))
      if (target) return messageTargets(target)
      // target unknown (should not happen: creation checks it): the narrowest audience
      return [{ scope: `event:${String(rec.eventKey)}`, audience: "staff" }]
    }
    default:
      return [{ scope: `event:${String(rec.eventKey)}`, audience: "all" }]
  }
}

const same = (a: LogTarget, b: LogTarget) => a.scope === b.scope && a.audience === b.audience

/**
 * Targets that lose a record when it changes from `before` to `after` (a comment switched to
 * private, or back). Each gets an `op: 'delete'`; a user who still reads the record through a new
 * target is excluded so they never see a delete racing their own upsert.
 */
export function lostTargets(before: LogTarget[], after: LogTarget[]): LogTarget[] {
  const keeper = after.find((t) => t.scope.startsWith("user:"))?.scope.slice(5)
  return before
    .filter((b) => !after.some((a) => same(a, b)))
    .map((t) => (keeper ? { ...t, excludeUser: keeper } : t))
}

/** The change-log scopes a sync scope parameter covers for this viewer. */
export function logScopesFor(syncScope: string, viewer: Viewer): string[] {
  if (syncScope === "global") return ["global"]
  if (syncScope === "user") return ["users", `user:${viewer.id}`]
  return [syncScope]
}

export function canSee(
  row: { audience: string; exclude_user: string | null },
  viewer: Viewer
): boolean {
  if (row.audience === "staff" && viewer.role === "guest") return false
  if (row.exclude_user && row.exclude_user === viewer.id) return false
  return true
}

/** MQTT topic for one target (REQUIREMENTS §9.4/9.5). */
export function topicFor(target: LogTarget, entity: EntityName): string {
  if (target.scope === "global" || target.scope === "users") return `vscout/global/data/${entity}`
  if (target.scope.startsWith("user:")) return `vscout/user/${target.scope.slice(5)}/data/${entity}`
  const ek = target.scope.slice("event:".length)
  return target.audience === "staff"
    ? `vscout/event/${ek}/chat/${entity}`
    : `vscout/event/${ek}/data/${entity}`
}
