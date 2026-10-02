// Write endpoints of the mock backend (http-api-contract §4). Same semantics over HTTP and, via the
// fake brokers, over MQTT RPC.
import { HttpResponse, http } from "msw"
import type { JsonBodyType } from "msw"
import { ENTITY_SCHEMAS } from "@/lib/contracts/entities"
import type { EntityName } from "@/lib/contracts/entities"
import { MOCK_CREDENTIALS, mockBackend } from "../mock-backend"
import type { MockRecord } from "../mock-backend"
import { applyAction } from "@/features/alliance-selection/utils/selection-rules"
import type { LocalAction } from "@/features/alliance-selection/utils/selection-rules"
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
export async function idempotent(
  request: Request,
  body: unknown,
  apply: () => Reply
) {
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

export const problem = (
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

export function publish(
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

export function validate(entity: EntityName, record: MockRecord): Reply | null {
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

/** Ranked teams for the event, from the reference data in the log (captain backfill). */
function rankedTeams(eventKey: string): Array<number> {
  return mockBackend.log
    .filter((e) => e.entity === "eventTeam" && e.scope === `event:${eventKey}`)
    .map((e) => e.envelope.data as { teamNumber: number; rank?: number | null })
    .filter((t) => typeof t.rank === "number")
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((t) => t.teamNumber)
}

export const writeHandlers = [
  // the shared live alliance board (http-api-contract §4.6): actions, never whole-board writes
  http.post(
    "*/api/v1/events/:ek/alliance-board/actions",
    async ({ request, params }) => {
      const body = (await request.json()) as {
        id: string
        baseRev: number
        action: {
          kind: string
          seed?: number
          team?: number
          actionId?: string
        }
      }
      return idempotent(request, body, () => {
        const ek = String(params.ek)
        const key = mockBackend.key("allianceBoard", ek)
        const board = mockBackend.records.get(key) as
          | (MockRecord & {
              alliances: Array<{
                seed: number
                captain: number | null
                picks: Array<number>
              }>
              declined: Array<number>
              locked: boolean
              status: string
              history: Array<Record<string, unknown>>
            })
          | undefined
        if (!board) return problem(404, "not_found")
        if (mockBackend.role === "guest") return problem(403, "role_required")
        const a = body.action
        const adminOnly = ["lock", "unlock", "reset", "setStatus"].includes(
          a.kind
        )
        if (mockBackend.role !== "admin" && (adminOnly || board.locked))
          return problem(403, "forbidden")
        if (body.baseRev !== board.rev)
          return problem(409, "rev_conflict", { current: board })
        const ranked = rankedTeams(ek)
        let next = { alliances: board.alliances, declined: board.declined }
        if (a.kind === "pick" || a.kind === "decline") {
          const r = applyAction(next, a as LocalAction, ranked)
          if (!r.ok)
            return problem(422, "validation_failed", { detail: r.error })
          next = r.board
        }
        const now = mockBackend.now()
        const record: MockRecord = {
          ...board,
          ...next,
          locked:
            a.kind === "lock"
              ? true
              : a.kind === "unlock"
                ? false
                : board.locked,
          rev: board.rev + 1,
          updatedAt: now,
          history: [
            ...board.history,
            {
              id: body.id,
              actorId: mockBackend.userId,
              kind: a.kind,
              ...(a.team ? { team: a.team } : {}),
              ...(a.seed ? { seed: a.seed } : {}),
              at: now,
            },
          ],
        }
        mockBackend.records.set(key, record)
        mockBackend.applied++
        publish("allianceBoard", record, request.headers.get("idempotency-key"))
        return { status: 200, body: record }
      })
    }
  ),

  // robot photos (http-api-contract §5.2): multipart, HTTP only
  http.post("*/api/v1/events/:ek/media", async ({ request, params }) => {
    const form = await request.formData()
    const id = String(form.get("id"))
    const file = form.get("file")
    const fields = {
      id,
      kind: String(form.get("kind")),
      teamNumber: Number(form.get("teamNumber")),
      bytes: file instanceof Blob ? file.size : 0,
    }
    return idempotent(request, fields, () => {
      if (mockBackend.role === "guest") return problem(403, "role_required")
      if (!(file instanceof Blob)) return problem(422, "validation_failed")
      const now = mockBackend.now()
      const record: MockRecord = {
        id,
        rev: 1,
        eventKey: String(params.ek),
        authorId: mockBackend.userId,
        createdAt: now,
        updatedAt: now,
        teamNumber: fields.teamNumber,
        kind: "robotPhoto",
        url: `https://media.example/${id}.jpg`,
        thumbUrl: `https://media.example/${id}_thumb.jpg`,
      }
      mockBackend.records.set(mockBackend.key("mediaAsset", id), record)
      mockBackend.applied++
      publish("mediaAsset", record, request.headers.get("idempotency-key"))
      return { status: 201, body: record }
    })
  }),

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
      // a pit entry may only reference uploaded photos (§5.2)
      const photos = Array.isArray(body.photos)
        ? (body.photos as Array<string>)
        : []
      if (
        photos.some(
          (p) => !mockBackend.records.has(mockBackend.key("mediaAsset", p))
        )
      )
        return problem(422, "media_missing")
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
      mockBackend.trash.set(key, current)
      if (current.authorId !== mockBackend.userId)
        mockBackend.audit.push({
          id: `audit-${mockBackend.audit.length + 1}`,
          eventKey:
            typeof current.eventKey === "string" ? current.eventKey : "",
          at: deletedAt,
          actorId: mockBackend.userId,
          action: "delete",
          entity,
          recordId: current.id,
          reason: new URL(request.url).searchParams.get("reason"),
        })
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

  http.post("*/api/v1/:collection/:id/restore", async ({ request, params }) => {
    const entity = COLLECTIONS[String(params.collection)]
    if (!entity) return undefined
    const body = (await request.json().catch(() => ({}))) as {
      baseRev?: unknown
    }
    return idempotent(request, null, () => {
      const key = mockBackend.key(entity, String(params.id))
      const rev = mockBackend.tombstones.get(key)
      const old = mockBackend.trash.get(key)
      if (rev === undefined || !old) return problem(404, "not_found")
      if (mockBackend.role !== "admin" && old.authorId !== mockBackend.userId)
        return problem(403, "not_author")
      if (body.baseRev !== rev)
        return problem(409, "rev_conflict", { current: null })
      const record = { ...old, rev: rev + 1, updatedAt: mockBackend.now() }
      mockBackend.tombstones.delete(key)
      mockBackend.trash.delete(key)
      mockBackend.records.set(key, record)
      mockBackend.applied++
      publish(entity, record, request.headers.get("idempotency-key"))
      return { status: 200, body: record }
    })
  }),

  // no pit map published (http-api-contract §5.3)
  http.get("*/api/v1/events/:ek/pit-map", () =>
    problemResponse(404, "not_found")
  ),

  // match videos (http-api-contract §5.1): none until a test adds some
  http.get("*/api/v1/events/:ek/matches/:mk/videos", () =>
    HttpResponse.json({ items: [] })
  ),

  http.post("*/api/v1/me/password", async ({ request }) => {
    const body = (await request.json()) as {
      currentPassword?: unknown
      newPassword?: unknown
    }
    if (typeof body.newPassword !== "string" || body.newPassword.length < 8)
      return problemResponse(422, "validation_failed")
    if (body.currentPassword !== MOCK_CREDENTIALS.password)
      // 422, not 401: a 401 on a signed-in call means "refresh the token" (open question B6-1)
      return problemResponse(422, "invalid_credentials")
    return new HttpResponse(null, { status: 204 })
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
