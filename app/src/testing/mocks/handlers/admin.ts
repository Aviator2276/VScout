// Admin endpoints (http-api-contract §2.1a, §2.6): event and team settings, guest access, users,
// the moderation audit. Optional endpoints (sync health, push stats) answer 404 like a server
// without them.
import { http, HttpResponse } from "msw"
import { wireEventSettings } from "@/lib/contracts/event-settings"
import { mockBackend } from "../mock-backend"
import type { MockRecord } from "../mock-backend"
import { problemResponse } from "./problem"
import { idempotent, problem, publish } from "./writes"

const WORDS = ["maple", "rocket", "harbor", "copper", "lantern", "meadow"]

/** The stored singleton, or the latest one seeded straight into the change log. */
function seeded(entity: string, id: string): MockRecord | undefined {
  const stored = mockBackend.records.get(`${entity}:${id}`)
  if (stored) return stored
  const env = mockBackend.log
    .filter((e) => e.entity === entity && e.envelope.id === id)
    .at(-1)
  return env?.envelope.data as MockRecord | undefined
}

function settingsOf(eventKey: string): MockRecord {
  return (
    seeded("eventSettings", eventKey) ?? {
      id: eventKey,
      eventKey,
      rev: 0,
      updatedAt: mockBackend.now(),
      scoutingOpen: true,
      guestAccess: { enabled: false, code: null, rotatedAt: null },
    }
  )
}

/** The guest code in force for an event, if an admin turned guest access on. */
export function activeGuestCode(): string | null {
  for (const [k, v] of mockBackend.records)
    if (k.startsWith("eventSettings:")) {
      const g = v.guestAccess as
        { enabled?: boolean; code?: string | null } | undefined
      if (g?.enabled && g.code) return g.code
    }
  return null
}

export const adminHandlers = [
  http.put("*/api/v1/team-settings", async ({ request }) => {
    const body = (await request.json()) as {
      baseRev?: number
      record?: { teamNumber?: number | null }
    }
    return idempotent(request, body, () => {
      if (mockBackend.role !== "admin") return problem(403, "role_required")
      const current = seeded("teamSettings", "team") ?? {
        id: "team",
        rev: 0,
        updatedAt: mockBackend.now(),
      }
      if (body.baseRev !== current.rev)
        return problem(409, "rev_conflict", { current })
      const record = {
        ...current,
        teamNumber: body.record?.teamNumber ?? null,
        rev: current.rev + 1,
        updatedAt: mockBackend.now(),
      }
      mockBackend.records.set("teamSettings:team", record)
      mockBackend.applied++
      mockBackend.append("global", "teamSettings", {
        v: 1,
        entity: "teamSettings",
        op: "upsert",
        id: "team",
        rev: record.rev,
        eventKey: null,
        ts: record.updatedAt,
        actorId: mockBackend.userId,
        ...(request.headers.get("idempotency-key")
          ? { opId: request.headers.get("idempotency-key") }
          : {}),
        data: record,
      })
      return { status: 200, body: record }
    })
  }),

  http.put("*/api/v1/events/:ek/settings", async ({ request, params }) => {
    const body = (await request.json()) as {
      baseRev?: number
      record?: Record<string, unknown>
    }
    const ek = String(params.ek)
    return idempotent(request, body, () => {
      if (mockBackend.role !== "admin") return problem(403, "role_required")
      const current = settingsOf(ek)
      if (body.baseRev !== current.rev)
        return problem(409, "rev_conflict", { current })
      const patch = { ...body.record }
      const guest = patch.guestAccess as
        { enabled: boolean; code: string | null } | undefined
      if (guest) {
        const old = current.guestAccess as {
          code: string | null
          rotatedAt: string | null
        }
        if (guest.code && !/^[2-9A-HJ-NP-Z]{6}$/.test(guest.code))
          return problem(422, "validation_failed")
        if (
          guest.enabled &&
          guest.code &&
          mockBackend.takenGuestCodes.has(guest.code)
        )
          return problem(409, "guest_code_taken")
        patch.guestAccess = {
          enabled: guest.enabled,
          code: guest.code,
          rotatedAt:
            guest.code !== old.code ? mockBackend.now() : old.rotatedAt,
        }
      }
      const record: MockRecord = {
        ...current,
        ...patch,
        id: ek,
        eventKey: ek,
        rev: current.rev + 1,
        updatedAt: mockBackend.now(),
      }
      if (!wireEventSettings.safeParse(record).success)
        return problem(422, "validation_failed")
      mockBackend.records.set(`eventSettings:${ek}`, record)
      mockBackend.applied++
      publish("eventSettings", record, request.headers.get("idempotency-key"))
      return { status: 200, body: record }
    })
  }),

  http.get("*/api/v1/admin/users", () => {
    if (mockBackend.role !== "admin")
      return problemResponse(403, "role_required")
    return HttpResponse.json({ items: [...mockBackend.users.values()] })
  }),

  http.post("*/api/v1/admin/users", async ({ request }) => {
    const body = (await request.json()) as {
      username: string
      displayName: string
      role: string
    }
    return idempotent(request, body, () => {
      if (mockBackend.role !== "admin") return problem(403, "role_required")
      if (
        [...mockBackend.users.values()].some(
          (u) => u.username === body.username
        )
      )
        return problem(409, "username_taken")
      const n = mockBackend.users.size + 1
      const user = {
        id: `01900000-0000-7000-8000-0000000091${String(n).padStart(2, "0")}`,
        rev: 1,
        updatedAt: mockBackend.now(),
        username: body.username,
        displayName: body.displayName,
        role: body.role,
        active: true,
      }
      mockBackend.users.set(user.id, user)
      const passphrase = `${WORDS[n % WORDS.length] ?? "maple"}-${WORDS[(n + 2) % WORDS.length] ?? "rocket"}-${WORDS[(n + 4) % WORDS.length] ?? "harbor"}-${10 + n}`
      return { status: 201, body: { user, passphrase } }
    })
  }),

  http.patch("*/api/v1/admin/users/:id", async ({ request, params }) => {
    const body = (await request.json()) as { role?: string; active?: boolean }
    return idempotent(request, body, () => {
      if (mockBackend.role !== "admin") return problem(403, "role_required")
      const user = mockBackend.users.get(String(params.id))
      if (!user) return problem(404, "not_found")
      const admins = [...mockBackend.users.values()].filter(
        (u) => u.role === "admin" && u.active !== false
      )
      if (
        user.role === "admin" &&
        (body.role === "scouter" || body.active === false) &&
        admins.length <= 1
      )
        return problem(409, "last_admin")
      const next = {
        ...user,
        ...body,
        rev: user.rev + 1,
        updatedAt: mockBackend.now(),
      }
      mockBackend.users.set(user.id, next)
      return { status: 200, body: next }
    })
  }),

  http.post("*/api/v1/admin/users/:id/revoke-sessions", async ({ request }) =>
    idempotent(request, null, () =>
      mockBackend.role === "admin"
        ? { status: 204, body: null }
        : problem(403, "role_required")
    )
  ),

  http.get("*/api/v1/events/:ek/admin/audit", ({ params }) =>
    mockBackend.role === "admin"
      ? HttpResponse.json({
          items: mockBackend.audit.filter((a) => a.eventKey === params.ek),
        })
      : problemResponse(403, "role_required")
  ),

  // optional endpoints this mock server doesn't have (AD9/AD10 degrade to "missing")
  http.get("*/api/v1/events/:ek/admin/sync-health", () =>
    problemResponse(404, "not_found")
  ),
  http.get("*/api/v1/admin/push/stats", () =>
    problemResponse(404, "not_found")
  ),
]
