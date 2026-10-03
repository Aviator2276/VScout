// The online-only actions' response and error handling, against a scripted ApiClient (the happy
// paths over real transports are in admin.test.ts and live-actions.test.ts).
import { describe, expect, it } from "vitest"
import { z } from "zod"
import type { ApiClient, RequestOptions } from "@/lib/api/api-client"
import { ApiError, OfflineError } from "@/lib/api/errors"
import { getKv } from "@/lib/db/kv"
import { createTestDb, testDeps } from "@/testing/db"
import {
  TEST_EVENT,
  wireAllianceBoard,
  wireComment,
  wireEventSettings,
  wireUser,
} from "@/testing/factories/wire"
import {
  createDemoEvent,
  createUser,
  deleteDemoEvent,
  fetchOptional,
  generateGuestCode,
  patchUser,
  refreshAudit,
  refreshUsers,
  revokeSessions,
  saveGuestAccess,
} from "../admin-actions"
import {
  changePassword,
  fail,
  refreshPitMap,
  restoreRecord,
  sendBoardAction,
} from "../live-actions"
import type { LiveDeps } from "../live-actions"

type Reply = unknown | Error

function apiError(status: number, code: string, extra: object = {}) {
  return new ApiError({ status, code, ...extra }, "http", null)
}
const offline = () => new OfflineError(["http", "mqtt"])

/** Answers each request with the next scripted body, or throws it when it's an Error. */
function scripted(...replies: Array<Reply>) {
  const sent: Array<RequestOptions> = []
  const api: ApiClient = {
    request: async (opts) => {
      sent.push(opts)
      const next = replies.length > 1 ? replies.shift() : replies[0]
      if (next instanceof Error) throw next
      return {
        status: 200,
        headers: {},
        body: next,
        transport: "http",
        latencyMs: 1,
      }
    },
  }
  return { api, sent }
}

function setup(...replies: Array<Reply>) {
  const db = createTestDb()
  const { applyCtx } = testDeps(db)
  const { api, sent } = scripted(...replies)
  const deps: LiveDeps = { ...applyCtx, api }
  return { db, deps, sent }
}

describe("fail()", () => {
  it("maps offline, API and unknown errors", () => {
    expect(fail(offline())).toEqual({ kind: "offline" })
    expect(fail(apiError(422, "invalid"))).toEqual({
      kind: "error",
      message: "422 invalid",
      code: "invalid",
    })
    expect(fail("boom")).toEqual({ kind: "error", message: "boom" })
  })
})

describe("generateGuestCode", () => {
  it("maps random bytes onto the alphabet", () => {
    // byte % 32 → 0, 1, 31, 0, 31, 31
    expect(
      generateGuestCode(() => new Uint8Array([0, 1, 31, 32, 63, 255]))
    ).toBe("23Z2ZZ")
  })
})

describe("saveGuestAccess error paths (AD3b)", () => {
  it("keeps the current code and ignores a body that isn't event settings", async () => {
    const { db, deps, sent } = setup({ unexpected: true })
    await db.eventSettings.put({
      ...wireEventSettings({ rev: 4 }),
      guestAccess: { enabled: false, code: "K7M2QX" },
    } as never)
    expect(
      await saveGuestAccess(deps, TEST_EVENT, { enabled: true, newCode: false })
    ).toEqual({ kind: "ok" })
    expect(sent[0]?.body).toEqual({
      baseRev: 4,
      record: { guestAccess: { enabled: true, code: "K7M2QX" } },
    })
  })

  it("stores the returned settings", async () => {
    const saved = wireEventSettings({
      rev: 2,
      guestAccess: { enabled: true, code: "ABCDEF", rotatedAt: null },
    })
    const { db, deps } = setup(saved)
    await saveGuestAccess(
      deps,
      TEST_EVENT,
      { enabled: true, newCode: true },
      () => "ABCDEF"
    )
    expect((await db.eventSettings.get(TEST_EVENT))?.guestAccess).toMatchObject(
      { enabled: true, code: "ABCDEF" }
    )
  })

  it("gives up after five taken codes", async () => {
    const { deps, sent } = setup(apiError(409, "guest_code_taken"))
    let n = 0
    const r = await saveGuestAccess(
      deps,
      TEST_EVENT,
      { enabled: true, newCode: true },
      () => `CODE0${++n}`
    )
    expect(r).toEqual({
      kind: "error",
      message: "Couldn’t find a free guest code",
    })
    expect(sent).toHaveLength(5)
  })

  it("returns other failures as they are", async () => {
    const { deps } = setup(offline())
    expect(
      await saveGuestAccess(deps, TEST_EVENT, {
        enabled: false,
        newCode: false,
      })
    ).toEqual({ kind: "offline" })
  })
})

describe("user admin (AD2)", () => {
  it("refreshUsers stores every user, and rejects an unexpected body", async () => {
    const u = wireUser({ username: "sam" })
    const ok = setup({ items: [u] })
    expect(await refreshUsers(ok.deps)).toEqual({ kind: "ok" })
    expect(await ok.db.users.get(u.id)).toMatchObject({ username: "sam" })

    expect(await refreshUsers(setup({ items: "nope" }).deps)).toEqual({
      kind: "error",
      message: "Unexpected response",
    })
    expect(await refreshUsers(setup(offline()).deps)).toEqual({
      kind: "offline",
    })
  })

  it("createUser returns the user and the one-time passphrase", async () => {
    const u = wireUser({ username: "new" })
    const { db, deps } = setup({ user: u, passphrase: "tidy otter 12" })
    expect(
      await createUser(deps, {
        username: "new",
        displayName: "New",
        role: "scouter",
      })
    ).toEqual({ kind: "ok", user: u, passphrase: "tidy otter 12" })
    expect(await db.users.get(u.id)).toBeDefined()

    const input = { username: "x", displayName: "X", role: "admin" } as const
    expect(await createUser(setup({ user: u }).deps, input)).toEqual({
      kind: "error",
      message: "Unexpected response",
    })
    expect(
      await createUser(setup(apiError(409, "username_taken")).deps, input)
    ).toMatchObject({ kind: "error", code: "username_taken" })
  })

  it("patchUser stores a returned user and tolerates an empty body", async () => {
    const u = wireUser({ role: "admin", rev: 3 })
    const ok = setup(u)
    expect(await patchUser(ok.deps, u.id, { role: "admin" })).toEqual({
      kind: "ok",
    })
    expect(await ok.db.users.get(u.id)).toMatchObject({ role: "admin" })

    const empty = setup(null)
    expect(await patchUser(empty.deps, u.id, { active: false })).toEqual({
      kind: "ok",
    })
    expect(await empty.db.users.count()).toBe(0)
    expect(
      await patchUser(setup(apiError(409, "last_admin")).deps, u.id, {
        role: "scouter",
      })
    ).toMatchObject({ code: "last_admin" })
  })

  it("revokeSessions posts once and reports failures", async () => {
    const ok = setup(null)
    expect(await revokeSessions(ok.deps, "u1")).toEqual({ kind: "ok" })
    expect(ok.sent[0]).toMatchObject({
      method: "POST",
      path: "/admin/users/u1/revoke-sessions",
    })
    expect(await revokeSessions(setup(offline()).deps, "u1")).toEqual({
      kind: "offline",
    })
  })
})

describe("audit, optional endpoints and demo events", () => {
  const entry = {
    id: "a1",
    eventKey: TEST_EVENT,
    at: "2026-03-20T15:00:00.000Z",
    actorId: "u1",
    action: "hide",
    entity: "comment",
    recordId: "c1",
  }

  it("refreshAudit caches entries with numeric times", async () => {
    const ok = setup({ items: [entry] })
    expect(await refreshAudit(ok.deps, TEST_EVENT)).toEqual({ kind: "ok" })
    expect(await ok.db.adminAudit.get("a1")).toMatchObject({
      at: Date.parse(entry.at),
    })
    expect(await refreshAudit(setup({}).deps, TEST_EVENT)).toMatchObject({
      message: "Unexpected response",
    })
    expect(await refreshAudit(setup(offline()).deps, TEST_EVENT)).toEqual({
      kind: "offline",
    })
  })

  it("fetchOptional: a value, a bad body, a missing endpoint, a failure", async () => {
    const schema = z.object({ n: z.number() })
    expect(await fetchOptional(setup({ n: 1 }).deps, "/x", schema)).toEqual({
      kind: "ok",
      value: { n: 1 },
    })
    expect(await fetchOptional(setup({}).deps, "/x", schema)).toMatchObject({
      message: "Unexpected response",
    })
    expect(
      await fetchOptional(setup(apiError(404, "not_found")).deps, "/x", schema)
    ).toEqual({ kind: "missing" })
    expect(
      await fetchOptional(setup(new Error("HTTP 404")).deps, "/x", schema)
    ).toEqual({ kind: "missing" })
    expect(
      await fetchOptional(setup(apiError(500, "internal")).deps, "/x", schema)
    ).toMatchObject({ kind: "error", code: "internal" })
  })

  it("createDemoEvent and deleteDemoEvent", async () => {
    const opts = { seed: 7, teams: 24, playedPercent: 50, coveragePercent: 80 }
    expect(
      await createDemoEvent(setup({ eventKey: "2026demo7" }).deps, opts)
    ).toEqual({ kind: "ok", created: { eventKey: "2026demo7", counts: {} } })
    expect(await createDemoEvent(setup({}).deps, opts)).toMatchObject({
      message: "Unexpected response",
    })
    expect(await createDemoEvent(setup(offline()).deps, opts)).toEqual({
      kind: "offline",
    })

    const del = setup(null)
    expect(await deleteDemoEvent(del.deps, "2026demo7")).toEqual({ kind: "ok" })
    expect(del.sent[0]).toMatchObject({
      method: "DELETE",
      path: "/admin/demo-events/2026demo7",
    })
    expect(await deleteDemoEvent(setup(offline()).deps, "x")).toEqual({
      kind: "offline",
    })
  })
})

describe("sendBoardAction error paths (scout-tab.md B)", () => {
  const pick = { kind: "pick", seed: 1, team: 254 } as const
  const board = (o = {}) =>
    wireAllianceBoard({ status: "inProgress", rev: 5, ...o })

  it("an invalid body is an error, not a stored board", async () => {
    const { db, deps } = setup({ nope: 1 })
    expect(await sendBoardAction(deps, TEST_EVENT, 4, pick)).toEqual({
      kind: "error",
      message: "Invalid server response",
    })
    expect(await db.allianceBoards.count()).toBe(0)
  })

  it("a 409 without a usable board is an error", async () => {
    const { deps } = setup(apiError(409, "rev_mismatch", { current: null }))
    expect(await sendBoardAction(deps, TEST_EVENT, 4, pick)).toEqual({
      kind: "error",
      message: "409 rev_mismatch",
    })
  })

  it("a decline someone already recorded is 'already', with no known actor", async () => {
    const current = board({ declined: [254], history: [] })
    const { deps } = setup(apiError(409, "rev_mismatch", { current }))
    expect(
      await sendBoardAction(deps, TEST_EVENT, 4, { kind: "decline", team: 254 })
    ).toMatchObject({ kind: "already", actorId: null })
  })

  it("other actions after a 409 are conflicts", async () => {
    const current = board()
    const { deps } = setup(apiError(409, "rev_mismatch", { current }))
    expect(
      await sendBoardAction(deps, TEST_EVENT, 4, { kind: "reset" })
    ).toMatchObject({ kind: "conflict" })
  })

  it("maps offline, forbidden, other API errors and unknown errors", async () => {
    const r = (e: Error) =>
      sendBoardAction(setup(e).deps, TEST_EVENT, 4, { kind: "lock" })
    expect(await r(offline())).toEqual({ kind: "offline" })
    expect(await r(apiError(403, "forbidden"))).toEqual({ kind: "forbidden" })
    expect(await r(apiError(500, "internal"))).toEqual({
      kind: "error",
      message: "500 internal",
    })
    expect(await r(new Error("weird"))).toEqual({
      kind: "error",
      message: "Error: weird",
    })
  })
})

describe("changePassword (ADR-038)", () => {
  it("sends the passwords as an auth request", async () => {
    const { deps, sent } = setup(null)
    expect(await changePassword(deps, "old", "new")).toEqual({ kind: "ok" })
    expect(sent[0]).toMatchObject({
      path: "/me/password",
      class: "auth",
      body: { currentPassword: "old", newPassword: "new" },
    })
    expect(
      await changePassword(setup(apiError(401, "bad_password")).deps, "a", "b")
    ).toMatchObject({ code: "bad_password" })
  })
})

describe("restoreRecord edge cases (ADR-029)", () => {
  async function withTomb(
    t: ReturnType<typeof setup>,
    entity: string,
    id: string
  ) {
    await t.db.tombstones.put({
      entity,
      id,
      rev: 2,
      deletedAt: 0,
      eventKey: TEST_EVENT,
      syncState: "synced",
    })
  }

  it("nothing to restore without a tombstone", async () => {
    expect(await restoreRecord(setup().deps, "comment", "c1")).toEqual({
      kind: "error",
      message: "Nothing to restore",
    })
  })

  it("entities without a REST collection can't be restored", async () => {
    const t = setup()
    await withTomb(t, "eventSettings", TEST_EVENT)
    expect(await restoreRecord(t.deps, "eventSettings", TEST_EVENT)).toEqual({
      kind: "error",
      message: "This can’t be restored",
    })
  })

  it("an invalid server record is an error; a failure is reported", async () => {
    const c = wireComment()
    const bad = setup({ id: c.id })
    await withTomb(bad, "comment", c.id)
    expect(await restoreRecord(bad.deps, "comment", c.id)).toEqual({
      kind: "error",
      message: "Invalid server response",
    })

    const off = setup(offline())
    await withTomb(off, "comment", c.id)
    expect(await restoreRecord(off.deps, "comment", c.id)).toEqual({
      kind: "offline",
    })
  })
})

describe("refreshPitMap (http-api-contract §5.3)", () => {
  const map = {
    rev: 1,
    imageUrl: "https://example.com/pits.png",
    pits: [{ teamNumber: 254, x: 0, y: 0, w: 1, h: 1 }],
  }

  it("caches the map with the fetch time", async () => {
    const { db, deps } = setup(map)
    expect(await refreshPitMap(deps, TEST_EVENT)).toEqual({ kind: "ok" })
    expect(await getKv(db, `pitMap:${TEST_EVENT}`)).toEqual({
      map,
      fetchedAt: deps.now(),
    })
  })

  it("a 404 caches 'not published yet'", async () => {
    const { db, deps } = setup(apiError(404, "not_found"))
    expect(await refreshPitMap(deps, TEST_EVENT)).toEqual({ kind: "ok" })
    expect((await getKv(db, `pitMap:${TEST_EVENT}`))?.map).toBeNull()
  })

  it("a bad body is an error and offline keeps the cache", async () => {
    expect(await refreshPitMap(setup({}).deps, TEST_EVENT)).toEqual({
      kind: "error",
      message: "Unexpected pit map",
    })
    const { db, deps } = setup(offline())
    expect(await refreshPitMap(deps, TEST_EVENT)).toEqual({ kind: "offline" })
    expect(await getKv(db, `pitMap:${TEST_EVENT}`)).toBeUndefined()
  })
})
