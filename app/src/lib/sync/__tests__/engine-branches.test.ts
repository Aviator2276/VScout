import { HttpResponse, http } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { change } from "@/testing/changes"
import { API, setupEngine } from "@/testing/engine"
import { wireComment } from "@/testing/factories/wire"
import { MOCK_USER_ID, mockBackend } from "@/testing/mocks/mock-backend"
import { server } from "@/testing/mocks/server"
import { applyChanges } from "../apply-envelope"
import { retryDelay } from "../backoff"
import { createRecord, deleteRecord, updateRecord } from "../mutate"
import { buildBody, buildRequest, toWireBody } from "../requests"
import { attachSyncTriggers } from "../triggers"
import type { OutboxOp } from "@/lib/db/types"

beforeEach(() => mockBackend.reset())
afterEach(() => vi.useRealTimers())

const comment = (body = "x") => ({
  eventKey: "2026casj",
  teamNumber: 254,
  body,
  tags: [],
  visibility: "team" as const,
})
const ctxOf = (s: ReturnType<typeof setupEngine>) => ({
  db: s.db,
  games: () => null,
  now: s.clock.now,
  newId: () => "id",
})

async function synced(s: ReturnType<typeof setupEngine>) {
  const c = wireComment({ rev: 1, authorId: MOCK_USER_ID })
  await applyChanges([change("comment", c)], ctxOf(s))
  mockBackend.records.set(mockBackend.key("comment", c.id), { ...c, rev: 1 })
  return c
}

describe("push: every response class", () => {
  it("restores a record whose delete the server forbids (403)", async () => {
    const s = setupEngine()
    const c = await synced(s)
    mockBackend.records.set(mockBackend.key("comment", c.id), {
      ...c,
      rev: 1,
      authorId: "someone-else",
    })
    await deleteRecord(s.mutateDeps, "comment", c.id)
    await s.engine.syncNow("write", { pushOnly: true })
    expect(await s.db.comments.get(c.id)).toMatchObject({ syncState: "synced" })
    expect(await s.db.conflicts.toArray()).toMatchObject([
      { kind: "forbidden" },
    ])
  })

  it("an update to a record the server no longer has is deleted-remotely (404)", async () => {
    const s = setupEngine()
    const c = await synced(s)
    mockBackend.records.clear()
    await updateRecord(s.mutateDeps, "comment", c.id, (r) => ({
      ...r,
      body: "edit",
    }))
    await s.engine.syncNow("write", { pushOnly: true })
    expect(await s.db.conflicts.toArray()).toMatchObject([
      { kind: "deleted-remotely" },
    ])
    expect(await s.db.outbox.toArray()).toMatchObject([{ state: "blocked" }])
  })

  it("a duplicate scouting entry becomes a duplicate conflict with the existing record", async () => {
    const s = setupEngine()
    const entry = {
      eventKey: "2026casj",
      matchKey: "2026casj_qm1",
      teamNumber: 254,
      station: "red1" as const,
      scouterLevel: "experienced" as const,
      tags: [],
      gameId: "2099-test-game",
      schemaVersion: 2,
      data: { "pre.noShow": true },
    }
    await createRecord(s.mutateDeps, "scoutEntry", entry)
    await s.engine.syncNow("write", { pushOnly: true })
    await createRecord(s.mutateDeps, "scoutEntry", entry) // same author, same robot, other device
    await s.engine.syncNow("write", { pushOnly: true })
    expect(await s.db.conflicts.toArray()).toMatchObject([
      { kind: "duplicate", remote: { teamNumber: 254 } },
    ])
  })

  it("stops on 429 and backs off", async () => {
    server.use(
      http.post(`${API}/events/:ek/comments`, () =>
        HttpResponse.json(
          { status: 429, code: "rate_limited" },
          { status: 429 }
        )
      )
    )
    const s = setupEngine()
    await createRecord(s.mutateDeps, "comment", comment("a"))
    await createRecord(s.mutateDeps, "comment", comment("b"))
    await s.engine.syncNow("write", { pushOnly: true })
    const ops = await s.db.outbox.orderBy("seq").toArray()
    expect(ops.map((o) => o.attempts)).toEqual([1, 0])
  })

  it("marks an op failed when the server's answer doesn't validate", async () => {
    server.use(
      http.post(`${API}/events/:ek/comments`, () =>
        HttpResponse.json({ nonsense: true }, { status: 201 })
      )
    )
    const s = setupEngine()
    await createRecord(s.mutateDeps, "comment", comment())
    await s.engine.syncNow("write", { pushOnly: true })
    expect(await s.db.outbox.toArray()).toMatchObject([
      { state: "failed", lastError: { message: "Invalid server response" } },
    ])
  })

  it("sends nothing without a session, and skips other users' ops", async () => {
    const s = setupEngine()
    await createRecord(s.mutateDeps, "comment", comment())
    await s.db.outbox.toCollection().modify({ userId: "someone-else" })
    await s.engine.syncNow("write", { pushOnly: true })
    expect(mockBackend.applied).toBe(0)
  })
})

describe("request builders", () => {
  const op = (o: Partial<OutboxOp>): OutboxOp => ({
    opId: "o",
    userId: "u",
    entity: "comment",
    recordId: "r1",
    recordKey: "comment:r1",
    eventKey: "2026casj",
    kind: "create",
    state: "queued",
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: 0,
    ...o,
  })

  it("routes each entity and kind (http-api-contract §4.2)", () => {
    expect(buildRequest(op({ kind: "create" }))).toMatchObject({
      method: "POST",
      path: "/events/2026casj/comments",
    })
    expect(buildRequest(op({ kind: "update" }))).toMatchObject({
      method: "PUT",
      path: "/comments/r1",
    })
    expect(buildRequest(op({ kind: "delete", baseRev: 4 }))).toEqual({
      method: "DELETE",
      path: "/comments/r1",
      query: { baseRev: "4" },
    })
    expect(
      buildRequest(op({ entity: "userSettings", kind: "update" }))
    ).toMatchObject({ method: "PATCH", path: "/me/settings" })
    expect(
      buildRequest(op({ entity: "teamSettings", kind: "update" }))
    ).toMatchObject({ method: "PUT", path: "/team-settings" })
    expect(
      buildRequest(
        op({ entity: "eventSettings", recordId: "2026casj", kind: "update" })
      )
    ).toMatchObject({ path: "/events/2026casj/settings" })
    expect(() =>
      buildRequest(op({ kind: "upload", entity: "mediaAsset" }))
    ).toThrow("Phase 4")
    expect(() => buildRequest(op({ entity: "match" }))).toThrow(
      "no write endpoint"
    )
  })

  it("never sends server or local fields, and patches all settings keys when none are listed", () => {
    const record = {
      id: "r1",
      rev: 2,
      updatedAt: 1,
      createdAt: 1,
      authorId: "a",
      syncState: "pending",
      localUpdatedAt: 1,
      body: "b",
    }
    expect(toWireBody(record)).toEqual({ id: "r1", body: "b" })
    expect(buildBody(op({ kind: "update" }), record)).toEqual({
      baseRev: 2,
      record: { id: "r1", body: "b" },
    })
    expect(buildBody(op({ kind: "delete" }), record)).toBeNull()
    expect(
      buildBody(op({ entity: "userSettings", kind: "update" }), {
        id: "u",
        userId: "u",
        rev: 1,
        theme: "dark",
      })
    ).toEqual({
      baseRev: 1,
      patch: { theme: "dark" },
    })
  })

  it("backs off exponentially with jitter, capped at 5 minutes", () => {
    expect(retryDelay(0, () => 0.5)).toBe(1000)
    expect(retryDelay(3, () => 0)).toBe(6400)
    expect(retryDelay(30, () => 1)).toBe(360_000)
  })
})

describe("engine lifecycle", () => {
  it("start resets inflight ops and runs a boot sync; requestPush is debounced", async () => {
    const s = setupEngine()
    await createRecord(s.mutateDeps, "comment", comment())
    await s.db.outbox.toCollection().modify({ state: "inflight" })
    await s.engine.start()
    await s.engine.start() // idempotent
    await vi.waitFor(async () => expect(await s.db.outbox.count()).toBe(0))
    await createRecord(s.mutateDeps, "comment", comment("later"))
    s.engine.requestPush("write")
    s.engine.requestPush("write")
    await vi.waitFor(async () => expect(await s.db.outbox.count()).toBe(0))
    expect(mockBackend.applied).toBe(2)
    s.engine.stop()
  })

  it("skips a visible sync right after a successful one unless forced", async () => {
    const s = setupEngine()
    await s.engine.syncNow("boot")
    const spy = vi.spyOn(s.engine, "syncNow")
    s.engine.requestSync("visible")
    await new Promise((r) => setTimeout(r, 20))
    expect(spy).not.toHaveBeenCalled()
    s.engine.requestSync("visible", { force: true })
    s.engine.requestSync("manual")
    await vi.waitFor(() =>
      expect(s.engine.status.getSnapshot().phase).toBe("idle")
    )
  })

  it("runs the foreground interval while visible and waits while hidden", async () => {
    const s = setupEngine({ intervalMs: { idle: 20, pending: 10 } })
    let pulls = 0
    server.events.on("request:start", ({ request }) => {
      if (request.url.includes("entities=teamSettings")) pulls++
    })
    await s.engine.start()
    await vi.waitFor(() => expect(pulls).toBeGreaterThanOrEqual(3))
    s.engine.setVisible(false)
    await new Promise((r) => setTimeout(r, 40)) // let an in-flight run finish
    const hidden = pulls
    await new Promise((r) => setTimeout(r, 80))
    expect(pulls).toBe(hidden)
    s.engine.stop()
    server.events.removeAllListeners()
  })

  it("reports a failing run as an error, not a crash", async () => {
    server.use(
      http.get(`${API}/sync/changes`, () =>
        HttpResponse.json({ not: "a page" })
      )
    )
    const s = setupEngine()
    expect((await s.engine.syncNow("boot")).outcome).toBe("error")
    expect(s.engine.status.getSnapshot()).toMatchObject({
      phase: "error",
      lastError: { message: expect.stringContaining("Invalid") as string },
    })
  })

  it("browser events become sync requests", () => {
    const target = new EventTarget()
    const vis = { state: "visible" as DocumentVisibilityState }
    const doc = {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      get visibilityState() {
        return vis.state
      },
    }
    const win = new EventTarget()
    const seen: Array<string> = []
    const detach = attachSyncTriggers(
      {
        requestSync: (r) => seen.push(r),
        setVisible: (v) => seen.push(`visible=${String(v)}`),
      },
      { window: win, document: doc }
    )
    vis.state = "hidden"
    target.dispatchEvent(new Event("visibilitychange"))
    vis.state = "visible"
    target.dispatchEvent(new Event("visibilitychange"))
    win.dispatchEvent(new Event("online"))
    detach()
    win.dispatchEvent(new Event("online"))
    expect(seen).toEqual(["visible=false", "visible=true", "visible", "online"])
  })
})

describe("engine without a session or network", () => {
  it("does nothing without a session", async () => {
    const s = setupEngine()
    const engine = (await import("../engine")).createSyncEngine({
      db: s.db,
      api: s.api,
      clock: s.clock,
      ids: { newId: () => "x" },
      games: () => null,
      session: () => null,
      activeEventKey: () => null,
    })
    expect(await engine.syncNow("boot")).toEqual({ outcome: "ok", sent: 0 })
  })

  it("reports offline when a pull can't reach the server", async () => {
    server.use(http.get(`${API}/sync/changes`, () => HttpResponse.error()))
    const s = setupEngine()
    expect((await s.engine.syncNow("boot")).outcome).toBe("offline")
    expect(s.engine.status.getSnapshot().phase).toBe("offline")
  })
})

describe("engine defaults and odd pages", () => {
  it("works with default debounce, interval and jitter", async () => {
    const s = setupEngine()
    const engine = (await import("../engine")).createSyncEngine({
      db: s.db,
      api: s.api,
      clock: s.clock,
      ids: { newId: () => "x" },
      games: () => null,
      session: () => ({ userId: MOCK_USER_ID, role: "scouter" }),
      activeEventKey: () => "2026casj",
    })
    engine.requestSync("manual")
    await vi.waitFor(
      () => expect(engine.status.getSnapshot().lastSuccessAt).toBeDefined(),
      { timeout: 3000 }
    )
    await createRecord(s.mutateDeps, "comment", comment())
    engine.requestPush("write")
    await vi.waitFor(async () => expect(await s.db.outbox.count()).toBe(0), {
      timeout: 3000,
    })
    engine.stop()
  })

  it("skips invalid envelopes in a page and still advances", async () => {
    mockBackend.append("event:2026casj", "match", {
      v: 1,
      entity: "match",
      op: "upsert",
      id: "bad",
      rev: 1,
      eventKey: "2026casj",
      ts: "nope",
    })
    const s = setupEngine()
    await s.engine.syncNow("boot")
    expect(
      await s.db.syncCursors.get(["event:2026casj", "match"])
    ).toMatchObject({ cursor: "1", bootstrapState: "done" })
  })

  it("a delete that conflicts keeps the deleted record as my side", async () => {
    const s = setupEngine()
    const c = await synced(s)
    mockBackend.records.set(mockBackend.key("comment", c.id), { ...c, rev: 5 })
    await deleteRecord(s.mutateDeps, "comment", c.id)
    await s.engine.syncNow("write", { pushOnly: true })
    expect(await s.db.conflicts.toArray()).toMatchObject([
      { kind: "rev-mismatch", local: { id: c.id }, remoteRev: 5 },
    ])
  })
})
