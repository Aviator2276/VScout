// Write endpoints of the mock backend (http-api-contract §4). Same semantics over HTTP and, via the
// fake brokers, over MQTT RPC.
import { HttpResponse, http } from "msw"
import type { JsonBodyType } from "msw"
import { ENTITY_SCHEMAS } from "@/lib/contracts/entities"
import type { EntityName } from "@/lib/contracts/entities"
import { mockBackend } from "../mock-backend"
import type { MockRecord } from "../mock-backend"
import { problemResponse } from "./problem"

const COLLECTIONS: Record<string, EntityName> = {
  "scout-entries": "scoutEntry",
  "pit-scouting": "pitScouting",
  "post-scouting": "postScouting",
  "alliance-ranks": "allianceRank",
  comments: "comment",
  messages: "message",
  reactions: "reaction",
  picklists: "picklist",
  "picklist-entries": "picklistEntry",
}

type Reply = { status: number; body: unknown }

/** Idempotency-Key replay (§4.1): same key + same body → the stored response. */
async function idempotent(request: Request, body: unknown, apply: () => Reply) {
  const key = request.headers.get("idempotency-key")
  if (!key)
    return problemResponse(400, "validation_failed", {
      detail: "Idempotency-Key required",
    })
  const token =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? ""
  if (mockBackend.expiredTokens.has(token))
    return problemResponse(401, "token_expired")
  const url = new URL(request.url)
  const hash = `${request.method} ${url.pathname}${url.search} ${JSON.stringify(body ?? null)}`
  const stored = mockBackend.idempotency.get(`${mockBackend.userId}:${key}`)
  let reply: Reply
  if (stored) {
    if (stored.hash !== hash)
      return problemResponse(422, "idempotency_key_reuse")
    reply = stored
  } else {
    reply = apply()
    mockBackend.idempotency.set(`${mockBackend.userId}:${key}`, {
      hash,
      ...reply,
    })
  }
  if (mockBackend.loseNextResponse) {
    mockBackend.loseNextResponse = false
    return HttpResponse.error()
  }
  await Promise.resolve()
  const isProblem = reply.status >= 400
  return HttpResponse.json(reply.body as JsonBodyType, {
    status: reply.status,
    headers: {
      "Content-Type": isProblem
        ? "application/problem+json"
        : "application/json",
    },
  })
}

const problem = (
  status: number,
  code: string,
  extra: Record<string, unknown> = {}
): Reply => ({
  status,
  body: {
    type: `https://vscout.app/errors/${code}`,
    title: code,
    status,
    code,
    ...extra,
  },
})

function publish(
  entity: EntityName,
  record: MockRecord,
  opId: string | null,
  op: "upsert" | "delete" = "upsert"
) {
  const eventKey = typeof record.eventKey === "string" ? record.eventKey : null
  mockBackend.append(eventKey ? `event:${eventKey}` : "user", entity, {
    v: 1,
    entity,
    op,
    id: record.id,
    rev: record.rev,
    eventKey,
    ts: record.updatedAt,
    actorId: mockBackend.userId,
    ...(opId ? { opId } : {}),
    ...(op === "upsert" ? { data: record } : {}),
  })
}

function validate(entity: EntityName, record: MockRecord): Reply | null {
  const r = ENTITY_SCHEMAS[entity].safeParse(record)
  if (r.success) return null
  return problem(422, "validation_failed", {
    errors: r.error.issues.map((i) => ({
      path: i.path.join("."),
      code: i.code,
      message: i.message,
    })),
  })
}

function naturalDuplicate(
  entity: EntityName,
  rec: Record<string, unknown>
): MockRecord | undefined {
  if (entity !== "scoutEntry") return undefined
  for (const r of mockBackend.records.values())
    if (
      r.matchKey === rec.matchKey &&
      r.teamNumber === rec.teamNumber &&
      r.authorId === mockBackend.userId &&
      mockBackend.records.get(mockBackend.key("scoutEntry", r.id)) === r
    )
      return r
  return undefined
}

export const writeHandlers = [
  http.post("*/api/v1/events/:ek/:collection", async ({ request, params }) => {
    const entity = COLLECTIONS[String(params.collection)]
    if (!entity) return undefined
    const body = (await request.json()) as Record<string, unknown>
    return idempotent(request, body, () => {
      if (
        mockBackend.role === "guest" &&
        !(entity === "reaction" && body.targetType === "announcement")
      )
        return problem(403, "role_required")
      const id = String(body.id)
      const key = mockBackend.key(entity, id)
      if (mockBackend.tombstones.has(key))
        return problem(409, "deleted", { current: null })
      const existing = mockBackend.records.get(key)
      if (existing) return problem(409, "already_exists", { current: existing })
      const dup = naturalDuplicate(entity, body)
      if (dup) return problem(409, "duplicate", { current: dup })
      const now = mockBackend.now()
      const record: MockRecord = {
        ...body,
        id,
        rev: 1,
        eventKey: String(params.ek),
        authorId: mockBackend.userId,
        createdAt: now,
        updatedAt: now,
      }
      const invalid = validate(entity, record)
      if (invalid) return invalid
      mockBackend.records.set(key, record)
      mockBackend.applied++
      publish(entity, record, request.headers.get("idempotency-key"))
      return { status: 201, body: record }
    })
  }),

  http.put("*/api/v1/:collection/:id", async ({ request, params }) => {
    const entity = COLLECTIONS[String(params.collection)]
    if (!entity) return undefined
    const body = (await request.json()) as {
      baseRev: number
      record: Record<string, unknown>
    }
    return idempotent(request, body, () => {
      if (mockBackend.role === "guest") return problem(403, "role_required")
      const key = mockBackend.key(entity, String(params.id))
      if (mockBackend.tombstones.has(key))
        return problem(409, "deleted", { current: null })
      const current = mockBackend.records.get(key)
      if (!current) return problem(404, "not_found", { current: null })
      if (
        mockBackend.role !== "admin" &&
        current.authorId !== mockBackend.userId
      )
        return problem(403, "not_author")
      if (body.baseRev !== current.rev)
        return problem(409, "rev_conflict", { current })
      const record: MockRecord = {
        ...body.record,
        id: current.id,
        rev: current.rev + 1,
        eventKey: current.eventKey,
        authorId: current.authorId,
        createdAt: current.createdAt,
        updatedAt: mockBackend.now(),
      }
      const invalid = validate(entity, record)
      if (invalid) return invalid
      mockBackend.records.set(key, record)
      mockBackend.applied++
      publish(entity, record, request.headers.get("idempotency-key"))
      return { status: 200, body: record }
    })
  }),

  http.delete("*/api/v1/:collection/:id", async ({ request, params }) => {
    const entity = COLLECTIONS[String(params.collection)]
    if (!entity) return undefined
    const baseRev = Number(new URL(request.url).searchParams.get("baseRev"))
    return idempotent(request, null, () => {
      const key = mockBackend.key(entity, String(params.id))
      if (mockBackend.tombstones.has(key))
        return problem(409, "deleted", { current: null })
      const current = mockBackend.records.get(key)
      if (!current) return problem(404, "not_found", { current: null })
      const guestReaction =
        mockBackend.role === "guest" && entity === "reaction"
      if (mockBackend.role === "guest" && !guestReaction)
        return problem(403, "role_required")
      if (
        mockBackend.role !== "admin" &&
        current.authorId !== mockBackend.userId
      )
        return problem(403, "not_author")
      if (baseRev !== current.rev)
        return problem(409, "rev_conflict", { current })
      const deletedAt = mockBackend.now()
      const rev = current.rev + 1
      mockBackend.records.delete(key)
      mockBackend.tombstones.set(key, rev)
      mockBackend.applied++
      publish(
        entity,
        { ...current, rev, updatedAt: deletedAt },
        request.headers.get("idempotency-key"),
        "delete"
      )
      return { status: 200, body: { id: current.id, rev, deletedAt } }
    })
  }),

  http.patch("*/api/v1/me/settings", async ({ request }) => {
    const body = (await request.json()) as {
      baseRev: number
      patch: Record<string, unknown>
    }
    return idempotent(request, body, () => {
      if (mockBackend.role === "guest") return problem(403, "role_required")
      const key = mockBackend.key("userSettings", mockBackend.userId)
      const current = mockBackend.records.get(key) ?? {
        id: mockBackend.userId,
        rev: 0,
        userId: mockBackend.userId,
      }
      if (body.baseRev !== current.rev)
        return problem(409, "rev_conflict", { current })
      const record: MockRecord = {
        ...current,
        ...body.patch,
        id: mockBackend.userId,
        userId: mockBackend.userId,
        rev: current.rev + 1,
        updatedAt: mockBackend.now(),
      }
      mockBackend.records.set(key, record)
      mockBackend.applied++
      mockBackend.append("user", "userSettings", {
        v: 1,
        entity: "userSettings",
        op: "upsert",
        id: record.id,
        rev: record.rev,
        eventKey: null,
        ts: record.updatedAt,
        opId: request.headers.get("idempotency-key"),
        data: record,
      })
      return { status: 200, body: record }
    })
  }),
]
