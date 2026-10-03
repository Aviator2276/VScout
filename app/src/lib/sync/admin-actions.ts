// Online-only admin requests (features/admin.md, http-api-contract §2.1a, §2.6): never queued, sent
// through lib/api (MQTT RPC or HTTP, ADR-063). Results are applied to Dexie where they are data.
import { decodeRecord } from "@/lib/api/adapters/entity-registry"
import { wireEventSettings } from "@/lib/contracts/event-settings"
import { demoEventCreated } from "@/lib/contracts/demo-events"
import type {
  DemoEventCreated,
  DemoEventOptions,
} from "@/lib/contracts/demo-events"
import { wireUser } from "@/lib/contracts/user"
import type { WireUser } from "@/lib/contracts/user"
import { z } from "zod"
import type { DomainChange } from "@/lib/api/adapters/change-envelope-adapter"
import { applyChanges } from "./apply-envelope"
import type { LiveDeps, OnlineResult } from "./live-actions"
import { fail } from "./live-actions"

/** 6 characters with no 0/O/1/I (ADR-073) */
export const GUEST_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

export function generateGuestCode(
  random: (n: number) => Uint8Array = (n) =>
    crypto.getRandomValues(new Uint8Array(n))
): string {
  // 256 is a multiple of 32, so `% 32` keeps every character equally likely
  return [...random(6)]
    .map((b) => GUEST_CODE_ALPHABET[b % GUEST_CODE_ALPHABET.length] ?? "2")
    .join("")
}

async function applyRecord(
  deps: LiveDeps,
  entity: "eventSettings" | "user",
  body: unknown
) {
  const decoded = decodeRecord(entity, body)
  if (!decoded.ok) return
  const r = decoded.value as {
    id: string
    rev: number
    updatedAt: number
    eventKey?: string
  }
  const change = {
    entity,
    op: "upsert",
    id: r.id,
    rev: r.rev,
    eventKey: r.eventKey ?? null,
    ts: r.updatedAt,
    record: decoded.value,
  } as DomainChange
  await applyChanges([change], deps)
}

/**
 * Guest access on/off or a new code (AD3b). `409 guest_code_taken` → a fresh code, silently (criterion 8b).
 */
export async function saveGuestAccess(
  deps: LiveDeps,
  eventKey: string,
  next: { enabled: boolean; newCode: boolean },
  newCode: () => string = () => generateGuestCode()
): Promise<OnlineResult> {
  const current = await deps.db.eventSettings.get(eventKey)
  let code =
    next.newCode || !current?.guestAccess.code
      ? newCode()
      : current.guestAccess.code
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await deps.api.request({
        method: "PUT",
        path: `/events/${eventKey}/settings`,
        class: "write",
        idempotencyKey: deps.newId(),
        body: {
          baseRev: current?.rev ?? 0,
          record: {
            guestAccess: next.enabled
              ? { enabled: true, code }
              : { enabled: false, code },
          },
        },
      })
      if (wireEventSettings.safeParse(res.body).success)
        await applyRecord(deps, "eventSettings", res.body)
      return { kind: "ok" }
    } catch (error) {
      const r = fail(error)
      if (r.kind === "error" && r.code === "guest_code_taken") {
        code = newCode()
        continue
      }
      return r
    }
  }
  return { kind: "error", message: "Couldn’t find a free guest code" }
}

const userList = z.object({ items: z.array(wireUser) })
const createdUser = z.object({ user: wireUser, passphrase: z.string().min(1) })

export type UserPatch = {
  role?: "admin" | "scouter"
  active?: boolean
  scouterLevel?: "new" | "experienced"
}

export async function refreshUsers(deps: LiveDeps): Promise<OnlineResult> {
  try {
    const res = await deps.api.request({
      method: "GET",
      path: "/admin/users",
      class: "delta",
    })
    const parsed = userList.safeParse(res.body)
    if (!parsed.success)
      return { kind: "error", message: "Unexpected response" }
    for (const u of parsed.data.items) await applyRecord(deps, "user", u)
    return { kind: "ok" }
  } catch (error) {
    return fail(error)
  }
}

export async function createUser(
  deps: LiveDeps,
  input: { username: string; displayName: string; role: "admin" | "scouter" }
): Promise<
  | { kind: "ok"; user: WireUser; passphrase: string }
  | Exclude<OnlineResult, { kind: "ok" }>
> {
  try {
    const res = await deps.api.request({
      method: "POST",
      path: "/admin/users",
      class: "write",
      idempotencyKey: deps.newId(),
      body: input,
    })
    const parsed = createdUser.safeParse(res.body)
    if (!parsed.success)
      return { kind: "error", message: "Unexpected response" }
    await applyRecord(deps, "user", parsed.data.user)
    return { kind: "ok", ...parsed.data }
  } catch (error) {
    return fail(error) as Exclude<OnlineResult, { kind: "ok" }>
  }
}

export async function patchUser(
  deps: LiveDeps,
  userId: string,
  patch: UserPatch
): Promise<OnlineResult> {
  try {
    const res = await deps.api.request({
      method: "PATCH",
      path: `/admin/users/${userId}`,
      class: "write",
      idempotencyKey: deps.newId(),
      body: patch,
    })
    if (wireUser.safeParse(res.body).success)
      await applyRecord(deps, "user", res.body)
    return { kind: "ok" }
  } catch (error) {
    return fail(error)
  }
}

export async function revokeSessions(
  deps: LiveDeps,
  userId: string
): Promise<OnlineResult> {
  try {
    await deps.api.request({
      method: "POST",
      path: `/admin/users/${userId}/revoke-sessions`,
      class: "write",
      idempotencyKey: deps.newId(),
    })
    return { kind: "ok" }
  } catch (error) {
    return fail(error)
  }
}

export const auditEntry = z.looseObject({
  id: z.string(),
  eventKey: z.string(),
  at: z.string(),
  actorId: z.string(),
  action: z.string(),
  entity: z.string(),
  recordId: z.string(),
  reason: z.string().nullable().optional(),
})
export type AuditEntry = z.infer<typeof auditEntry>

/** Moderation history (AD5), cached in the admin-only adminAudit table. */
export async function refreshAudit(
  deps: LiveDeps,
  eventKey: string
): Promise<OnlineResult> {
  try {
    const res = await deps.api.request({
      method: "GET",
      path: `/events/${eventKey}/admin/audit`,
      query: { limit: "200" },
      class: "delta",
    })
    const parsed = z.object({ items: z.array(auditEntry) }).safeParse(res.body)
    if (!parsed.success)
      return { kind: "error", message: "Unexpected response" }
    await deps.db.adminAudit.bulkPut(
      parsed.data.items.map((e) => ({ ...e, at: Date.parse(e.at) }))
    )
    return { kind: "ok" }
  } catch (error) {
    return fail(error)
  }
}

export const syncHealth = z.looseObject({
  devices: z.array(
    z.looseObject({
      userId: z.string(),
      deviceId: z.string(),
      appVersion: z.string().optional(),
      lastSeenAt: z.string(),
      lastTransport: z.enum(["http", "mqtt"]).optional(),
      rejectedOps24h: z.number().int().optional(),
      role: z.string().optional(),
    })
  ),
  guestSessions: z.number().int().optional(),
})
export type SyncHealth = z.infer<typeof syncHealth>

/** Optional endpoints (AD9/AD10): a 404 means "this server doesn't have it", not an error. */
export async function fetchOptional<T>(
  deps: Pick<LiveDeps, "api">,
  path: string,
  schema: z.ZodType<T>
): Promise<
  | { kind: "ok"; value: T }
  | { kind: "missing" }
  | Exclude<OnlineResult, { kind: "ok" }>
> {
  try {
    const res = await deps.api.request({ method: "GET", path, class: "delta" })
    const parsed = schema.safeParse(res.body)
    return parsed.success
      ? { kind: "ok", value: parsed.data }
      : { kind: "error", message: "Unexpected response" }
  } catch (error) {
    const r = fail(error)
    if (r.kind === "error" && (r.code === "not_found" || /404/.test(r.message)))
      return { kind: "missing" }
    return r as Exclude<OnlineResult, { kind: "ok" }>
  }
}

/** Generate a shared demo event (AD7a, capability demoSeed): the server builds it from the options. */
export async function createDemoEvent(
  deps: Pick<LiveDeps, "api" | "newId">,
  options: DemoEventOptions
): Promise<
  | { kind: "ok"; created: DemoEventCreated }
  | Exclude<OnlineResult, { kind: "ok" }>
> {
  try {
    const res = await deps.api.request({
      method: "POST",
      path: "/admin/demo-events",
      class: "write",
      idempotencyKey: deps.newId(),
      body: options,
    })
    const parsed = demoEventCreated.safeParse(res.body)
    return parsed.success
      ? { kind: "ok", created: parsed.data }
      : { kind: "error", message: "Unexpected response" }
  } catch (error) {
    return fail(error) as Exclude<OnlineResult, { kind: "ok" }>
  }
}

/** Delete a demo event and everything in it, for everyone (AD7a). */
export async function deleteDemoEvent(
  deps: Pick<LiveDeps, "api" | "newId">,
  eventKey: string
): Promise<OnlineResult> {
  try {
    await deps.api.request({
      method: "DELETE",
      path: `/admin/demo-events/${eventKey}`,
      class: "write",
      idempotencyKey: deps.newId(),
    })
    return { kind: "ok" }
  } catch (error) {
    return fail(error)
  }
}
