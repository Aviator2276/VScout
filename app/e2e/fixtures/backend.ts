// A stateful backend for write-path e2e (Phase 4 gate): the same in-memory mock backend and MSW
// handlers the unit tests use (http-api-contract §4: Idempotency-Key, baseRev 409s, duplicates,
// tombstones), seeded with the e2e event. Auth and /meta are answered here with times relative to
// now. Every page or context routed through it shares one backend, so two "devices" see each other.
import type { BrowserContext, Route } from "@playwright/test"
import { getResponse } from "msw"
import { handlers } from "../../src/testing/mocks/handlers/handlers"
import { activeGuestCode } from "../../src/testing/mocks/handlers/admin"
import {
  MOCK_GUEST_CODE,
  mockBackend,
} from "../../src/testing/mocks/mock-backend"
import type { SyncScope } from "../../src/lib/contracts/sync-changes"
import type { EntityName } from "../../src/lib/contracts/entities"
import { CREDENTIALS, TEAMS, buildData, iso, session } from "./mock-api"

export { CREDENTIALS }
export const backend = mockBackend

export function seedBackend(role: "scouter" | "admin" | "guest" = "scouter") {
  mockBackend.reset()
  mockBackend.role = role
  for (const [key, changes] of Object.entries(buildData())) {
    const [scope, entity] = key.split("|") as [SyncScope, EntityName]
    for (const c of changes)
      mockBackend.append(scope, entity, c as Record<string, unknown>)
  }
}

/** The live alliance board, in progress, captains from the rankings (http-api-contract §4.6). */
export function seedBoard() {
  const board = {
    id: "2026casj",
    eventKey: "2026casj",
    rev: 1,
    updatedAt: iso(),
    status: "inProgress",
    locked: false,
    declined: [],
    history: [],
    alliances: Array.from({ length: 8 }, (_, i) => ({
      seed: i + 1,
      captain: TEAMS[i] ?? null,
      picks: [],
    })),
  }
  mockBackend.records.set("allianceBoard:2026casj", board)
  mockBackend.append("event:2026casj", "allianceBoard", {
    v: 1,
    entity: "allianceBoard",
    op: "upsert",
    id: board.id,
    rev: 1,
    eventKey: board.eventKey,
    ts: board.updatedAt,
    data: board,
  })
}

/** Server-side records of an entity (what the backend accepted). */
export function serverRecords(entity: string) {
  return [...mockBackend.records.entries()]
    .filter(([k]) => k.startsWith(`${entity}:`))
    .map(([, v]) => v)
}

const GUEST = {
  id: "01900000-0000-7000-8000-00000000a001",
  username: null,
  displayName: "Guest",
  role: "guest",
  teamNumber: 2276,
}

async function answer(route: Route) {
  const req = route.request()
  const url = new URL(req.url())
  const path = url.pathname.replace(/^.*\/api\/v1/, "")
  const json = (body: unknown, status = 200) =>
    route.fulfill({ status, json: body })

  if (path === "/meta")
    return json({
      apiVersion: 1,
      minClientVersion: "2.0.0-alpha.0",
      serverTime: iso(),
      activeGameId: "2026-rebuilt",
      gameSchemaVersions: { "2026-rebuilt": [1] },
      capabilities: { guestLogin: true, reactions: true },
    })
  const guest = mockBackend.role === "guest"
  const s = () => {
    const base = session()
    if (guest) return { ...base, eventKey: "2026casj", user: GUEST }
    return mockBackend.role === "admin"
      ? { ...base, user: { ...base.user, role: "admin" } }
      : base
  }
  if (path === "/auth/login") {
    const body = req.postDataJSON() as { username?: string; password?: string }
    if (
      body.username !== CREDENTIALS.username ||
      body.password !== CREDENTIALS.password
    )
      return json(
        { type: "x", title: "x", status: 401, code: "invalid_credentials" },
        401
      )
    mockBackend.signedIn = true
    return json(s())
  }
  if (path === "/auth/guest") {
    // the code an admin set wins over the fixed mock code (features/admin.md AD3b)
    const body = req.postDataJSON() as { code?: string }
    if (body.code !== (activeGuestCode() ?? MOCK_GUEST_CODE))
      return json(
        { type: "x", title: "x", status: 401, code: "invalid_guest_code" },
        401
      )
    mockBackend.signedIn = true
    return json(s())
  }
  // refresh works only after a sign-in (a stand-in for the HttpOnly cookie)
  if (path === "/auth/refresh")
    return mockBackend.signedIn
      ? json(s())
      : json(
          { type: "x", title: "x", status: 401, code: "refresh_invalid" },
          401
        )
  if (path === "/auth/logout") {
    mockBackend.signedIn = false
    return route.fulfill({ status: 204 })
  }
  if (path === "/me")
    return json({
      user: s().user,
      serverTime: iso(),
      refreshExpiresAt: s().refreshExpiresAt,
    })

  const request = new Request(req.url(), {
    method: req.method(),
    headers: req.headers(),
    ...(["GET", "HEAD"].includes(req.method()) ? {} : { body: req.postData() }),
  })
  const res = await getResponse(handlers, request)
  if (!res) return route.fulfill({ status: 404 })
  if (res.type === "error") return route.abort("failed")
  return route.fulfill({
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: Buffer.from(await res.arrayBuffer()),
  })
}

export interface Device {
  /** offline for the app and for this backend (route interception ignores context.setOffline) */
  setOffline: (offline: boolean) => Promise<void>
}

export async function useBackend(context: BrowserContext): Promise<Device> {
  let offline = false
  await context.route("**/api/v1/**", (route) =>
    offline ? route.abort("internetdisconnected") : answer(route)
  )
  return {
    setOffline: async (next) => {
      offline = next
      await context.setOffline(next)
    },
  }
}
