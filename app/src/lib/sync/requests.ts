// Outbox op → API request (http-api-contract §4.2, §2.5). Bodies are built from the current record
// when an op is first attempted (sealed), so coalesced edits send the latest state.
import type { HttpMethod } from "@/lib/api/transport/api-transport"
import type { EntityName } from "@/lib/contracts/entities"
import type { OutboxOp } from "@/lib/db/types"
import { ENTITY_DEFS } from "./entity-registry"

/** Local or server-set fields that never go in a request body. */
const NOT_SENT = new Set([
  "rev",
  "updatedAt",
  "createdAt",
  "authorId",
  "updatedBy",
  "syncState",
  "localUpdatedAt",
  "unsupported",
])

export function toWireBody(
  record: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([k]) => !NOT_SENT.has(k))
  )
}

export interface OpRequest {
  method: HttpMethod
  path: string
  query?: Record<string, string>
  body?: unknown
}

/** The sealed body: what a retry must resend byte for byte (same Idempotency-Key). */
export function buildBody(
  op: OutboxOp,
  record: Record<string, unknown> | undefined
): unknown {
  // uploads seal only the media id; the blob stays in mediaUploads
  if (op.kind === "upload") return { mediaId: op.recordId }
  if (op.kind === "delete" || !record) return null
  if (op.entity === "userSettings") {
    const doc = toWireBody(record)
    const keys =
      op.patchKeys ??
      Object.keys(doc).filter((k) => k !== "id" && k !== "userId")
    return {
      baseRev: record.rev,
      patch: Object.fromEntries(keys.map((k) => [k, doc[k] ?? null])),
    }
  }
  if (op.kind === "create") return toWireBody(record)
  if (op.entity === "eventSettings") {
    // guest access is changed online only (features/admin.md AD3b), never by a queued write
    const { guestAccess: _guest, ...rest } = toWireBody(record)
    return { baseRev: record.rev, record: rest }
  }
  return { baseRev: record.rev, record: toWireBody(record) }
}

export function buildRequest(op: OutboxOp): OpRequest {
  const body = op.sealedBody ?? undefined
  if (op.entity === "userSettings")
    return { method: "PATCH", path: "/me/settings", body }
  if (op.entity === "teamSettings")
    return { method: "PUT", path: "/team-settings", body }
  if (op.entity === "eventSettings")
    return { method: "PUT", path: `/events/${op.recordId}/settings`, body }
  const collection = ENTITY_DEFS[op.entity as EntityName].collection
  if (!collection) throw new Error(`${op.entity} has no write endpoint`)
  switch (op.kind) {
    case "create":
      return {
        method: "POST",
        path: `/events/${op.eventKey ?? ""}/${collection}`,
        body,
      }
    case "update":
      return { method: "PUT", path: `/${collection}/${op.recordId}`, body }
    case "delete":
      return {
        method: "DELETE",
        path: `/${collection}/${op.recordId}`,
        query: {
          baseRev: String(op.baseRev ?? 0),
          ...(op.reason ? { reason: op.reason } : {}),
        },
      }
    case "upload":
      // the multipart body is built from mediaUploads at send time (push.ts)
      return { method: "POST", path: `/events/${op.eventKey ?? ""}/media` }
  }
}
