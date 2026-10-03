import { HttpResponse, getResponse, http } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { getKv } from "@/lib/db/kv"
import { API, setupEngine } from "@/testing/engine"
import { wireEnvelope, wireMatch } from "@/testing/factories/wire"
import { MOCK_USER_ID, mockBackend } from "@/testing/mocks/mock-backend"
import { writeHandlers } from "@/testing/mocks/handlers/writes"
import { server } from "@/testing/mocks/server"
import { resolveConflict } from "../conflicts"
import { createRecord, updateRecord } from "../mutate"
import { mergeRequests } from "../engine"
import { pullScope } from "../pull"

beforeEach(() => mockBackend.reset())

const comment = (body = "Fast") => ({
  eventKey: "2026casj",
  teamNumber: 254,
  body,
  tags: [],
  visibility: "team" as const,
})

function seedMatches(n: number) {
  for (let i = 1; i <= n; i++)
    mockBackend.append(
      "event:2026casj",
      "match",
      wireEnvelope("match", wireMatch({ matchNumber: i }))
    )
}

/** Every scenario runs over both transports with identical results (ADR-063 parity). */
describe.each(["http", "mqtt"] as const)("sync engine over %s", (transport) => {
  it("bootstraps an event and records done cursors", async () => {
    seedMatches(12)
    const { db, engine } = setupEngine({ transport })
    expect(await engine.syncNow("boot")).toMatchObject({ outcome: "ok" })
    expect(await db.matches.count()).toBe(12)
    const cursor = await db.syncCursors.get(["event:2026casj", "match"])
    expect(cursor).toMatchObject({ cursor: "12", bootstrapState: "done" })
    expect(engine.status.getSnapshot()).toMatchObject({
      phase: "idle",
      lastSuccessAt: expect.any(Number) as number,
    })
  })

  it("an offline write waits, then syncs with the server's rev when the network returns", async () => {
    const { db, engine, mutateDeps } = setupEngine({ transport })
    const c = await createRecord(mutateDeps, "comment", comment())
    server.use(
      http.post(`${API}/events/:ek/comments`, () => HttpResponse.error())
    )
    if (transport === "mqtt")
      server.use(http.all(`${API}/*`, () => HttpResponse.error()))
    const offlineEngine = setupEngine({ transport: "http", db }).engine
    expect(
      (await offlineEngine.syncNow("write", { pushOnly: true })).outcome
    ).toBe("offline")
    expect(await db.outbox.toArray()).toMatchObject([
      { state: "queued", attempts: 1 },
    ])
    server.resetHandlers()
    await engine.syncNow("online")
    expect(await db.comments.get(c.id)).toMatchObject({
      rev: 1,
      syncState: "synced",
    })
    expect(await db.outbox.count()).toBe(0)
  })

  it("a lost response is retried with the same key and applied exactly once", async () => {
    const { db, engine, mutateDeps } = setupEngine({ transport })
    const c = await createRecord(mutateDeps, "comment", comment())
    mockBackend.loseNextResponse = true
    await engine.syncNow("write", { pushOnly: true })
    await engine.syncNow("online", { pushOnly: true })
    expect(mockBackend.applied).toBe(1)
    expect(await db.comments.get(c.id)).toMatchObject({
      rev: 1,
      syncState: "synced",
    })
  })

  it("409 → conflict; keep mine → the next PUT carries the server's rev", async () => {
    const { db, engine, mutateDeps, clock } = setupEngine({ transport })
    const c = await createRecord(mutateDeps, "comment", comment("v1"))
    await engine.syncNow("write", { pushOnly: true })
    // someone (an admin) edits it on the server
    const key = mockBackend.key("comment", c.id)
    const server1 = mockBackend.records.get(key)
    if (!server1) throw new Error("not on server")
    mockBackend.records.set(key, { ...server1, rev: 2, body: "admin edit" })
    await updateRecord(mutateDeps, "comment", c.id, (r) => ({
      ...r,
      body: "mine",
    }))
    await engine.syncNow("write", { pushOnly: true })
    const conflict = await db.conflicts.toCollection().first()
    expect(conflict).toMatchObject({
      kind: "rev-mismatch",
      baseRev: 1,
      remoteRev: 2,
      source: "push",
    })
    expect((await db.comments.get(c.id))?.syncState).toBe("conflict")

    await resolveConflict(
      { db, now: clock.now, newId: () => "k1-op", session: mutateDeps.session },
      conflict?.id ?? "",
      "keep-mine"
    )
    await engine.syncNow("write", { pushOnly: true })
    expect(mockBackend.records.get(key)).toMatchObject({ rev: 3, body: "mine" })
    expect(await db.comments.get(c.id)).toMatchObject({
      rev: 3,
      syncState: "synced",
    })
  })

  it("keep mine survives full syncs when the other edit is in the change log", async () => {
    const { db, engine, mutateDeps, clock } = setupEngine({ transport })
    const c = await createRecord(mutateDeps, "comment", comment("v1"))
    await engine.syncNow("write")
    const key = mockBackend.key("comment", c.id)
    const server1 = mockBackend.records.get(key)
    if (!server1) throw new Error("not on server")
    // another device edits it: the server stores rev 2 and logs the change, like a real backend
    const edited = { ...server1, rev: 2, body: "other device" }
    mockBackend.records.set(key, edited)
    mockBackend.append("event:2026casj", "comment", {
      v: 1,
      entity: "comment",
      op: "upsert",
      id: c.id,
      rev: 2,
      eventKey: "2026casj",
      ts: mockBackend.now(),
      data: edited,
    })
    await updateRecord(mutateDeps, "comment", c.id, (r) => ({
      ...r,
      body: "mine",
    }))
    await engine.syncNow("write")
    const conflict = await db.conflicts.where("status").equals("open").first()
    expect(conflict).toBeDefined()

    await resolveConflict(
      { db, now: clock.now, newId: () => "k2-op", session: mutateDeps.session },
      conflict?.id ?? "",
      "keep-mine"
    )
    await engine.syncNow("write")
    await engine.syncNow("online")
    expect(mockBackend.records.get(key)).toMatchObject({ body: "mine" })
    expect(await db.comments.get(c.id)).toMatchObject({
      body: "mine",
      syncState: "synced",
    })
    expect(await db.conflicts.where("status").equals("open").count()).toBe(0)
  })

  it("422 rejects one record and the others still sync", async () => {
    const { db, engine, mutateDeps } = setupEngine({ transport })
    const good = await createRecord(mutateDeps, "comment", comment("ok"))
    // bypass client validation to plant a record the server rejects
    await db.comments.put({ ...good, id: "bad-1", body: "" })
    await db.outbox.add({
      opId: "op-bad",
      userId: MOCK_USER_ID,
      entity: "comment",
      recordId: "bad-1",
      recordKey: "comment:bad-1",
      eventKey: "2026casj",
      kind: "create",
      state: "queued",
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: 0,
    })
    await engine.syncNow("write", { pushOnly: true })
    expect((await db.comments.get(good.id))?.syncState).toBe("synced")
    expect((await db.comments.get("bad-1"))?.syncState).toBe("rejected")
    expect(await db.conflicts.toArray()).toMatchObject([
      { kind: "rejected", serverErrors: [{ path: "body" }] },
    ])
    expect(await db.outbox.toArray()).toMatchObject([
      { opId: "op-bad", state: "failed" },
    ])
  })

  it("keeps per-record order: a sealed create, then an update, end in the latest state", async () => {
    const { db, engine, mutateDeps } = setupEngine({ transport })
    const c = await createRecord(mutateDeps, "comment", comment("v1"))
    mockBackend.loseNextResponse = true // the create is sealed and applied, but unacked
    await engine.syncNow("write", { pushOnly: true })
    await updateRecord(mutateDeps, "comment", c.id, (r) => ({
      ...r,
      body: "v2",
    }))
    // over HTTP the create is still unacked; over MQTT it was already retried on HTTP and acked
    expect((await db.outbox.toArray()).map((o) => o.kind).at(-1)).toBe("update")
    await engine.syncNow("online", { pushOnly: true })
    expect(
      mockBackend.records.get(mockBackend.key("comment", c.id))
    ).toMatchObject({ rev: 2, body: "v2" })
    expect(await db.comments.get(c.id)).toMatchObject({
      rev: 2,
      body: "v2",
      syncState: "synced",
    })
  })
})

describe("sync engine: response handling", () => {
  it("401 with a failed refresh pauses sync without counting an attempt", async () => {
    mockBackend.expiredTokens.add("expired")
    const { db, engine, mutateDeps, authLost } = setupEngine({
      token: "expired",
    })
    await createRecord(mutateDeps, "comment", comment())
    expect((await engine.syncNow("write", { pushOnly: true })).outcome).toBe(
      "auth"
    )
    expect(engine.status.getSnapshot().phase).toBe("paused-auth")
    expect(await db.outbox.toArray()).toMatchObject([
      { state: "queued", attempts: 0 },
    ])
    expect(authLost).toHaveLength(1)
  })

  it("426 stops and flags an app update; ops are kept", async () => {
    server.use(
      http.post(`${API}/events/:ek/comments`, () =>
        HttpResponse.json(
          { status: 426, code: "upgrade_required", minVersion: "3.0.0" },
          { status: 426 }
        )
      )
    )
    const { db, engine, mutateDeps } = setupEngine()
    await createRecord(mutateDeps, "comment", comment())
    expect((await engine.syncNow("write", { pushOnly: true })).outcome).toBe(
      "upgrade"
    )
    expect(await getKv(db, "needsAppUpdate")).toBe(true)
    expect(await db.outbox.count()).toBe(1)
  })

  it("a 5xx backs off that op (honoring Retry-After) and keeps flushing others", async () => {
    let first = true
    server.use(
      http.post(`${API}/events/:ek/comments`, async ({ request }) => {
        if (first) {
          first = false
          return HttpResponse.json(
            { status: 503, code: "unavailable" },
            { status: 503, headers: { "Retry-After": "30" } }
          )
        }
        return getResponse(writeHandlers, request)
      })
    )
    const { db, engine, mutateDeps, clock } = setupEngine()
    const a = await createRecord(mutateDeps, "comment", comment("a"))
    const b = await createRecord(mutateDeps, "comment", comment("b"))
    await engine.syncNow("write", { pushOnly: true })
    expect((await db.comments.get(b.id))?.syncState).toBe("synced")
    expect(await db.outbox.toArray()).toMatchObject([
      {
        recordId: a.id,
        state: "queued",
        attempts: 1,
        nextAttemptAt: clock.now() + 30_000,
      },
    ])
  })

  it("waits for dependencies before sending", async () => {
    const { db, engine, mutateDeps } = setupEngine()
    await createRecord(mutateDeps, "comment", comment(), {
      dependsOn: ["mediaAsset:photo-1"],
    })
    await db.outbox.add({
      opId: "photo-op",
      userId: MOCK_USER_ID,
      entity: "mediaAsset",
      recordId: "photo-1",
      recordKey: "mediaAsset:photo-1",
      eventKey: "2026casj",
      kind: "upload",
      state: "failed",
      attempts: 1,
      nextAttemptAt: 0,
      createdAt: 0,
    })
    await engine.syncNow("write", { pushOnly: true })
    expect(mockBackend.applied).toBe(0)
  })

  it("an MQTT echo that beats the HTTP response doesn't create a conflict", async () => {
    const { db, engine, mutateDeps } = setupEngine()
    server.use(
      http.post(`${API}/events/:ek/comments`, async ({ request }) => {
        const res = await getResponse(writeHandlers, request)
        const echo = mockBackend.log.at(-1)?.envelope
        await engine.ingestMany([echo]) // fan-out arrives first
        return res
      })
    )
    const c = await createRecord(mutateDeps, "comment", comment())
    await engine.syncNow("write", { pushOnly: true })
    expect(await db.comments.get(c.id)).toMatchObject({
      rev: 1,
      syncState: "synced",
    })
    expect(await db.conflicts.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it("an RPC timeout mid-flush is retried over HTTP with the same key → one record", async () => {
    const { db, engine, mutateDeps, broker } = setupEngine({
      transport: "mqtt",
      rpcTimeoutMs: 30,
    })
    broker.dropResponses = true
    const c = await createRecord(mutateDeps, "comment", comment())
    await engine.syncNow("write", { pushOnly: true })
    expect(mockBackend.applied).toBe(1)
    expect((await db.comments.get(c.id))?.syncState).toBe("synced")
  })

  it("rebases userSettings after a 409 and sends only my keys again (per-key LWW)", async () => {
    const { db, engine } = setupEngine()
    const key = mockBackend.key("userSettings", MOCK_USER_ID)
    mockBackend.records.set(key, {
      id: MOCK_USER_ID,
      userId: MOCK_USER_ID,
      rev: 2,
      theme: "light",
      updatedAt: "2026-03-20T15:00:00.000Z",
    })
    await db.userSettings.put({
      id: MOCK_USER_ID,
      userId: MOCK_USER_ID,
      rev: 1,
      updatedAt: 0,
      v: 1,
      scouterLevel: "new",
      watchedTeams: [],
      theme: "system",
      notifications: {
        announcements: true,
        directMessages: true,
        eventChat: "all",
        mutedChannelIds: [],
        ourMatchQueue: true,
        watchedMatchQueue: false,
        matchLeadMinutes: 10,
        matchResults: true,
      },
      celebrate: false,
      appBackground: "none",
      dismissedTips: [],
      syncState: "pending",
    })
    await db.outbox.add({
      opId: "s1",
      userId: MOCK_USER_ID,
      entity: "userSettings",
      recordId: MOCK_USER_ID,
      recordKey: `userSettings:${MOCK_USER_ID}`,
      eventKey: null,
      kind: "update",
      patchKeys: ["celebrate"],
      state: "queued",
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: 0,
    })
    await engine.syncNow("write", { pushOnly: true })
    expect(mockBackend.records.get(key)).toMatchObject({
      rev: 3,
      theme: "light",
      celebrate: false,
    })
    expect(await db.userSettings.get(MOCK_USER_ID)).toMatchObject({
      rev: 3,
      theme: "light",
      celebrate: false,
      syncState: "synced",
    })
    expect(await db.conflicts.count()).toBe(0)
  })

  it("rebases userSettings even when the server's copy is a bare placeholder (owner NC-3: Keep Mine kept failing)", async () => {
    const { db, engine } = setupEngine()
    const key = mockBackend.key("userSettings", MOCK_USER_ID)
    // no updatedAt: the record doesn't decode, but its rev is still known
    mockBackend.records.set(key, {
      id: MOCK_USER_ID,
      userId: MOCK_USER_ID,
      rev: 2,
      theme: "light",
    })
    await db.userSettings.put({
      id: MOCK_USER_ID,
      userId: MOCK_USER_ID,
      rev: 1,
      updatedAt: 0,
      v: 1,
      scouterLevel: "new",
      watchedTeams: [],
      theme: "system",
      notifications: {
        announcements: true,
        directMessages: true,
        eventChat: "all",
        mutedChannelIds: [],
        ourMatchQueue: true,
        watchedMatchQueue: false,
        matchLeadMinutes: 10,
        matchResults: true,
      },
      celebrate: false,
      appBackground: "none",
      dismissedTips: [],
      syncState: "pending",
    })
    await db.outbox.add({
      opId: "s1",
      userId: MOCK_USER_ID,
      entity: "userSettings",
      recordId: MOCK_USER_ID,
      recordKey: `userSettings:${MOCK_USER_ID}`,
      eventKey: null,
      kind: "update",
      patchKeys: ["celebrate"],
      state: "queued",
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: 0,
    })
    await engine.syncNow("write", { pushOnly: true })
    expect(mockBackend.records.get(key)).toMatchObject({
      rev: 3,
      theme: "light",
      celebrate: false,
    })
    expect(await db.userSettings.get(MOCK_USER_ID)).toMatchObject({
      rev: 3,
      celebrate: false,
      syncState: "synced",
    })
    expect(await db.conflicts.count()).toBe(0)
  })
})

describe("sync engine: pull", () => {
  it("resumes a bootstrap after an interruption without duplicates", async () => {
    seedMatches(25)
    const { db } = setupEngine()
    let calls = 0
    server.use(
      http.get(`${API}/sync/changes`, () =>
        ++calls === 2 ? HttpResponse.error() : undefined
      )
    )
    const { api } = setupEngine({ db })
    const ctx = {
      db,
      games: () => null,
      now: () => 0,
      newId: () => "x",
      api,
      pageSize: 10,
    }
    await expect(pullScope(ctx, "event:2026casj", ["match"])).rejects.toThrow()
    expect(await db.matches.count()).toBe(10)
    expect(await db.syncCursors.get(["event:2026casj", "match"])).toMatchObject(
      { cursor: "10", bootstrapState: "running" }
    )
    await pullScope(ctx, "event:2026casj", ["match"])
    expect(await db.matches.count()).toBe(25)
    expect(await db.syncCursors.get(["event:2026casj", "match"])).toMatchObject(
      { cursor: "25", bootstrapState: "done" }
    )
  })

  it("re-bootstraps on 410 cursor_expired and flags 403 scopes as forbidden", async () => {
    seedMatches(3)
    const { db, api } = setupEngine()
    const ctx = { db, games: () => null, now: () => 0, newId: () => "x", api }
    await db.syncCursors.put({
      scope: "event:2026casj",
      entity: "match",
      cursor: "stale",
      lastPulledAt: 0,
      bootstrapState: "done",
    })
    let expired = true
    server.use(
      http.get(`${API}/sync/changes`, () => {
        if (!expired) return undefined
        expired = false
        return HttpResponse.json(
          { status: 410, code: "cursor_expired" },
          { status: 410 }
        )
      })
    )
    expect(await pullScope(ctx, "event:2026casj", ["match"])).toBe("done")
    expect(await db.matches.count()).toBe(3)
    server.use(
      http.get(`${API}/sync/changes`, () =>
        HttpResponse.json({ status: 403, code: "forbidden" }, { status: 403 })
      )
    )
    expect(await pullScope(ctx, "event:2026abc", ["match"])).toBe("forbidden")
    expect(await db.syncCursors.get(["event:2026abc", "match"])).toMatchObject({
      forbidden: true,
    })
  })

  it("never asks a guest's server for userSettings (ADR-066)", async () => {
    const urls: Array<string> = []
    server.events.on("request:start", ({ request }) => {
      urls.push(decodeURIComponent(request.url))
    })
    const { engine } = setupEngine({ role: "guest" })
    await engine.syncNow("boot")
    server.events.removeAllListeners()
    expect(urls.some((u) => u.includes("scope=user"))).toBe(true)
    expect(urls.some((u) => u.includes("userSettings"))).toBe(false)
  })

  it("a control resync pulls only the named entities", async () => {
    const urls: Array<string> = []
    server.events.on("request:start", ({ request }) => {
      urls.push(decodeURIComponent(request.url))
    })
    const { engine } = setupEngine()
    await engine.syncNow("mqtt-control", { entities: ["eventTeam"] })
    server.events.removeAllListeners()
    const pulls = urls.filter((u) => u.includes("/sync/changes"))
    expect(pulls).toHaveLength(1)
    expect(pulls[0]).toContain("entities=eventTeam")
  })
})

describe("sync engine: concurrency and triggers", () => {
  it("only one tab runs at a time (Web Lock ifAvailable)", async () => {
    let held = false
    const locks = {
      async request<TResult>(
        _n: string,
        _o: { ifAvailable: true },
        cb: (lock: object | null) => Promise<TResult>
      ) {
        if (held) return cb(null)
        held = true
        try {
          return await cb({})
        } finally {
          held = false
        }
      },
    }
    seedMatches(2)
    const a = setupEngine({ locks })
    const b = setupEngine({ locks, db: a.db })
    const [ra, rb] = await Promise.all([
      a.engine.syncNow("boot"),
      b.engine.syncNow("boot"),
    ])
    expect([ra.outcome, rb.outcome].sort()).toEqual(["busy", "ok"])
    expect(b.engine.status.getSnapshot().leaderTab).toBe(false)
  })

  it("coalesces requests made during a run into one more run", async () => {
    seedMatches(1)
    const { engine } = setupEngine()
    let runs = 0
    server.events.on("request:start", ({ request }) => {
      // one request per run: the global scope's first priority group
      if (
        request.url.includes("scope=global") &&
        request.url.includes("entities=teamSettings")
      )
        runs++
    })
    const first = engine.syncNow("boot")
    void engine.syncNow("visible")
    void engine.syncNow("manual")
    await first
    server.events.removeAllListeners()
    expect(runs).toBe(2)
  })

  it("merges pending requests to the broadest one", () => {
    expect(mergeRequests(null, { reason: "write", pushOnly: true })).toEqual({
      reason: "write",
      pushOnly: true,
    })
    expect(
      mergeRequests(
        { reason: "write", pushOnly: true },
        { reason: "mqtt-control", pushOnly: false, entities: ["eventTeam"] }
      )
    ).toEqual({
      reason: "mqtt-control",
      pushOnly: false,
      entities: ["eventTeam"],
    })
    expect(
      mergeRequests(
        { reason: "mqtt-control", pushOnly: false, entities: ["a"] },
        { reason: "mqtt-control", pushOnly: false, entities: ["b"] }
      ).entities
    ).toEqual(["a", "b"])
    expect(
      mergeRequests(
        { reason: "mqtt-control", pushOnly: false, entities: ["a"] },
        { reason: "visible", pushOnly: false }
      ).entities
    ).toBeUndefined()
  })
})
