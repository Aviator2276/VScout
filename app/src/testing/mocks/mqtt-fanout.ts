// MQTT fan-out for the dev mock API (FX-61): which topics a change-log entry is published to
// (mqtt-contract §4, §4.2). The dev broker has no ACL, so this routing is what keeps the app's
// subscriptions honest: guests never subscribe to chat, and private records go to user topics only.
import type { LogEntry, MockRecord } from "./mock-backend"

/** the stored record by entity and id, live or deleted (deletes carry no `data`) */
export type RecordLookup = (
  entity: string,
  id: string
) => MockRecord | undefined

const DM = /^dm:([^:]+):([^:]+)$/

const userTopic = (userId: string, entity: string) =>
  `vscout/user/${userId}/data/${entity}`

/** a DM channel's two participants' topics; null for any other channel */
function dmTopics(channelId: unknown, entity: string): string[] | null {
  const [, a, b] = DM.exec(typeof channelId === "string" ? channelId : "") ?? []
  return a && b ? [userTopic(a, entity), userTopic(b, entity)] : null
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined
}

/**
 * Topics for one change. An empty list means "don't publish": the client still gets it on its next
 * `/sync/changes` pull, which is safer than guessing the audience of a private record.
 */
export function fanoutTopics(entry: LogEntry, lookup: RecordLookup): string[] {
  const { scope, entity, envelope } = entry
  const id = str(envelope.id) ?? ""
  const data =
    (envelope.data as Record<string, unknown> | undefined) ?? lookup(entity, id)

  if (scope === "global") return [`vscout/global/data/${entity}`]

  if (entity === "userSettings") {
    const owner = str(data?.userId) ?? id
    return owner ? [userTopic(owner, entity)] : []
  }

  if (scope === "user") {
    const owner = str(data?.userId) ?? str(data?.authorId)
    return owner ? [userTopic(owner, entity)] : []
  }

  const eventKey = scope.slice("event:".length)
  const eventTopic = (branch: "data" | "chat") =>
    `vscout/event/${eventKey}/${branch}/${entity}`

  if (entity === "message") {
    if (!data) return []
    return (
      dmTopics(data.channelId, entity) ?? [
        eventTopic(data.kind === "announcement" ? "data" : "chat"),
      ]
    )
  }

  if (entity === "reaction") {
    if (!data) return []
    if (data.targetType === "announcement") return [eventTopic("data")]
    const target = lookup("message", str(data.targetId) ?? "")
    if (!target) return []
    return dmTopics(target.channelId, entity) ?? [eventTopic("chat")]
  }

  if (entity === "comment") {
    if (!data) return []
    if (data.visibility === "private") {
      const author = str(data.authorId)
      return author ? [userTopic(author, entity)] : []
    }
  }

  return [eventTopic("data")]
}

/** contract §4.3: more than this many changes of one event at once become one `resync` */
export const BULK_THRESHOLD = 50

export interface FanoutMessage {
  topic: string
  payload: Record<string, unknown>
  qos: 0 | 1
}

// mqtt-contract §4.1: QoS 1 for records people act on, 0 for bulk reference data
const QOS0 = new Set([
  "eventTeam",
  "team",
  "event",
  "user",
  "mediaAsset",
  "reaction",
])

/**
 * One burst of appends (one request, or a demo seed) → the messages to publish. An event with more
 * than BULK_THRESHOLD changes in the burst gets one control `resync` instead of its envelopes.
 */
export function planFanout(
  entries: ReadonlyArray<LogEntry>,
  lookup: RecordLookup,
  now: string
): FanoutMessage[] {
  const perEvent = new Map<string, Set<string>>()
  const counts = new Map<string, number>()
  for (const { scope, entity } of entries) {
    if (!scope.startsWith("event:")) continue
    counts.set(scope, (counts.get(scope) ?? 0) + 1)
    perEvent.set(scope, (perEvent.get(scope) ?? new Set()).add(entity))
  }
  const bulk = new Set(
    [...counts].filter(([, n]) => n > BULK_THRESHOLD).map(([s]) => s)
  )

  const out: FanoutMessage[] = []
  for (const entry of entries) {
    if (bulk.has(entry.scope)) continue
    const qos = QOS0.has(entry.entity) ? 0 : 1
    for (const topic of fanoutTopics(entry, lookup))
      out.push({ topic, payload: entry.envelope, qos })
  }
  for (const scope of bulk) {
    out.push({
      topic: `vscout/event/${scope.slice("event:".length)}/control`,
      payload: {
        v: 1,
        cmd: "resync",
        entities: [...(perEvent.get(scope) ?? [])],
        reason: "bulk-change",
        ts: now,
      },
      qos: 1,
    })
  }
  return out
}
