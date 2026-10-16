import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { EVENT, harness, id, pullAll, scoutEntryBody } from "../helpers.js"
import type { Harness, Session } from "../helpers.js"

let h: Harness
let sam: Session
beforeEach(async () => {
  h = await harness()
  sam = await h.user("sam")
})
afterEach(async () => h.close())

const post = (as: Session, collection: string, body: unknown, key?: string) =>
  h.req({ method: "POST", url: `/api/v1/events/${EVENT}/${collection}`, as, body, ...(key ? { key } : {}) })

describe("idempotent creates", () => {
  it("accepts the client id, sets server fields, and replays the identical response", async () => {
    const body = { ...scoutEntryBody(), authorId: "spoofed", rev: 99, createdAt: "2000-01-01T00:00:00.000Z" }
    const key = id()
    const r = await post(sam, "scout-entries", body, key)
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ id: body.id, rev: 1, authorId: sam.userId, eventKey: EVENT })
    expect(r.body.createdAt).toBe(new Date(h.clock.now()).toISOString())
    h.clock.advance(5000)
    const replay = await post(sam, "scout-entries", body, key)
    expect(replay.status).toBe(201)
    expect(replay.body).toEqual(r.body)
  })

  it("rejects the same key with a different body (422 idempotency_key_reuse)", async () => {
    const key = id()
    await post(sam, "scout-entries", scoutEntryBody(), key)
    const r = await post(sam, "scout-entries", scoutEntryBody({ teamNumber: 1678 }), key)
    expect(r.status).toBe(422)
    expect(r.body.code).toBe("idempotency_key_reuse")
  })

  it("requires an Idempotency-Key", async () => {
    const r = await post(sam, "scout-entries", scoutEntryBody(), undefined)
    expect(r.status).toBe(201)
    const none = await h.req({ method: "POST", url: `/api/v1/events/${EVENT}/scout-entries`, as: sam, body: scoutEntryBody(), key: null })
    expect(none.status).toBe(400)
  })

  it("409 already_exists for a known id under a new key, 409 duplicate for a natural-key clash", async () => {
    const body = scoutEntryBody()
    const first = await post(sam, "scout-entries", body)
    const again = await post(sam, "scout-entries", body)
    expect(again.status).toBe(409)
    expect(again.body).toMatchObject({ code: "already_exists", current: first.body })
    const dup = await post(sam, "scout-entries", scoutEntryBody())
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe("duplicate")
    expect(dup.body.current.id).toBe(body.id)
    // another scouter may scout the same robot in the same match
    const alex = await post(h.admin, "scout-entries", scoutEntryBody())
    expect(alex.status).toBe(201)
  })

  it("validates the record and rejects unknown game versions", async () => {
    const bad = await post(sam, "scout-entries", scoutEntryBody({ station: "purple4" }))
    expect(bad.status).toBe(422)
    expect(bad.body.errors[0].path).toBe("station")
    const v = await post(sam, "scout-entries", scoutEntryBody({ schemaVersion: 7 }))
    expect(v.body.code).toBe("unsupported_schema_version")
    const g = await post(sam, "scout-entries", scoutEntryBody({ gameId: "2019-deepspace" }))
    expect(g.body.code).toBe("unknown_game")
  })

  it("keeps unknown fields of a newer app", async () => {
    const r = await post(sam, "comments", { id: id(), teamNumber: 254, body: "fast", futureField: { x: 1 } })
    expect(r.status).toBe(201)
    expect(r.body.futureField).toEqual({ x: 1 })
    expect(r.body.visibility).toBe("team")
  })

  it("404s for an event the server doesn't have", async () => {
    const r = await h.req({ method: "POST", url: "/api/v1/events/2026zzzz/comments", as: sam, body: { id: id(), teamNumber: 1, body: "x" } })
    expect(r.status).toBe(404)
  })
})

describe("updates, deletes and restore", () => {
  it("updates with baseRev; a stale baseRev is 409 rev_conflict with current", async () => {
    const c = await post(sam, "comments", { id: id(), teamNumber: 254, body: "v1" })
    const u = await h.req({ method: "PUT", url: `/api/v1/comments/${c.body.id}`, as: sam, body: { baseRev: 1, record: { ...c.body, body: "v2" } } })
    expect(u.status).toBe(200)
    expect(u.body).toMatchObject({ rev: 2, body: "v2", createdAt: c.body.createdAt })
    const stale = await h.req({ method: "PUT", url: `/api/v1/comments/${c.body.id}`, as: sam, body: { baseRev: 1, record: { ...c.body, body: "v3" } } })
    expect(stale.status).toBe(409)
    expect(stale.body).toMatchObject({ code: "rev_conflict", current: { rev: 2, body: "v2" } })
  })

  it("a non-author can't edit (403 not_author); an admin moderates and is recorded", async () => {
    const c = await post(sam, "comments", { id: id(), teamNumber: 254, body: "mine" })
    const other = await h.user("kim")
    const r = await h.req({ method: "PUT", url: `/api/v1/comments/${c.body.id}`, as: other, body: { baseRev: 1, record: { ...c.body, body: "no" } } })
    expect(r.status).toBe(403)
    expect(r.body.code).toBe("not_author")
    const del = await h.req({ method: "DELETE", url: `/api/v1/comments/${c.body.id}?baseRev=1&reason=spam`, as: h.admin })
    expect(del.status).toBe(200)
    const audit = await h.req({ method: "GET", url: `/api/v1/events/${EVENT}/admin/audit`, as: h.admin })
    expect(audit.body.items[0]).toMatchObject({ action: "delete", entity: "comment", recordId: c.body.id, reason: "spam" })
  })

  it("delete then restore keeps the same id; POST of a deleted id is 409 deleted", async () => {
    const body = scoutEntryBody()
    await post(sam, "scout-entries", body)
    const del = await h.req({ method: "DELETE", url: `/api/v1/scout-entries/${body.id}?baseRev=1`, as: sam })
    expect(del.status).toBe(200)
    expect(del.body).toMatchObject({ id: body.id, rev: 2 })
    expect(Date.parse(del.body.deletedAt)).toBe(h.clock.now())
    const upd = await h.req({ method: "PUT", url: `/api/v1/scout-entries/${body.id}`, as: sam, body: { baseRev: 2, record: body } })
    expect(upd.body).toMatchObject({ code: "deleted", current: null })
    const recreate = await post(sam, "scout-entries", body)
    expect(recreate.body.code).toBe("deleted")
    const restored = await h.req({ method: "POST", url: `/api/v1/scout-entries/${body.id}/restore`, as: sam, body: { baseRev: 2 } })
    expect(restored.status).toBe(200)
    expect(restored.body).toMatchObject({ id: body.id, rev: 3, teamNumber: 254 })
  })

  it("accepts If-Match instead of baseRev", async () => {
    const c = await post(sam, "comments", { id: id(), teamNumber: 254, body: "x" })
    const r = await h.req({ method: "DELETE", url: `/api/v1/comments/${c.body.id}`, as: sam, headers: { "if-match": '"1"' } })
    expect(r.status).toBe(200)
  })

  it("restore after 30 days is gone", async () => {
    const c = await post(sam, "comments", { id: id(), teamNumber: 254, body: "x" })
    await h.req({ method: "DELETE", url: `/api/v1/comments/${c.body.id}?baseRev=1`, as: sam })
    h.clock.advance(31 * 86_400_000)
    const fresh = await h.login("sam", "pw-sam-123", "new-dev")
    const r = await h.req({ method: "POST", url: `/api/v1/comments/${c.body.id}/restore`, as: fresh, body: { baseRev: 2 } })
    expect(r.status).toBe(404)
  })
})

describe("roles", () => {
  it("only admins post announcements and urgent messages", async () => {
    const r = await post(sam, "messages", { id: id(), channelId: `event:${EVENT}`, kind: "announcement", body: "hi" })
    expect(r.status).toBe(403)
    const u = await post(sam, "messages", { id: id(), channelId: `event:${EVENT}`, kind: "message", priority: "urgent", body: "hi" })
    expect(u.status).toBe(403)
    const a = await post(h.admin, "messages", { id: id(), channelId: `event:${EVENT}`, kind: "announcement", body: "hi" })
    expect(a.status).toBe(201)
    expect(a.body.priority).toBe("normal")
  })

  it("only admins make master picklists; owners manage their entries", async () => {
    const m = await post(sam, "picklists", { id: id(), name: "Master", purpose: "first", master: true })
    expect(m.status).toBe(403)
    const pl = await post(sam, "picklists", { id: id(), name: "Mine", purpose: "first", ballot: true })
    expect(pl.status).toBe(201)
    expect(pl.body.ownerId).toBe(sam.userId)
    const kim = await h.user("kim")
    const intrude = await post(kim, "picklist-entries", { id: id(), picklistId: pl.body.id, teamNumber: 254, rank: "a0" })
    expect(intrude.body.code).toBe("not_author")
    const e = await post(sam, "picklist-entries", { id: id(), picklistId: pl.body.id, teamNumber: 254, rank: "a0" })
    expect(e.status).toBe(201)
    const dup = await post(sam, "picklist-entries", { id: id(), picklistId: pl.body.id, teamNumber: 254, rank: "a1" })
    expect(dup.body.code).toBe("duplicate")
  })

  it("pit entries may only reference uploaded photos (422 media_missing)", async () => {
    const r = await post(sam, "pit-scouting", {
      id: id(),
      teamNumber: 254,
      gameId: "2026-rebuilt",
      schemaVersion: 1,
      data: {},
      robot: { drivetrain: "swerve" },
      photos: [id()],
    })
    expect(r.status).toBe(422)
    expect(r.body.code).toBe("media_missing")
  })
})

describe("the change log", () => {
  it("bootstraps the current state, then returns only newer changes; opId echoes the key", async () => {
    const key = id()
    const a = await post(sam, "scout-entries", scoutEntryBody(), key)
    const c = await post(sam, "comments", { id: id(), teamNumber: 254, body: "x" })
    await h.req({ method: "PUT", url: `/api/v1/comments/${c.body.id}`, as: sam, body: { baseRev: 1, record: { ...c.body, body: "y" } } })
    const boot = await pullAll(h, sam, `event:${EVENT}`, ["scoutEntry", "comment", "eventSettings", "allianceBoard"])
    expect(boot.status).toBe(200)
    const ids = boot.changes.map((e) => `${e.entity}:${e.id}:${e.rev}`)
    expect(ids).toContain(`scoutEntry:${a.body.id}:1`)
    expect(ids).toContain(`comment:${c.body.id}:2`)
    expect(ids).not.toContain(`comment:${c.body.id}:1`)
    expect(ids).toContain(`eventSettings:${EVENT}:1`)
    expect(boot.changes.find((e) => e.id === a.body.id)).toMatchObject({ v: 1, op: "upsert", opId: key, actorId: sam.userId, eventKey: EVENT })

    const later = await post(sam, "comments", { id: id(), teamNumber: 1678, body: "z" })
    const delta = await pullAll(h, sam, `event:${EVENT}`, ["scoutEntry", "comment", "eventSettings", "allianceBoard"], boot.cursors)
    expect(delta.changes.map((e) => e.id)).toEqual([later.body.id])
    const none = await pullAll(h, sam, `event:${EVENT}`, ["scoutEntry", "comment"], delta.cursors)
    expect(none.changes).toEqual([])
  })

  it("bootstrap leaves out deleted records; a delta carries the delete", async () => {
    const boot0 = await pullAll(h, sam, `event:${EVENT}`, ["comment"])
    const c = await post(sam, "comments", { id: id(), teamNumber: 254, body: "x" })
    await h.req({ method: "DELETE", url: `/api/v1/comments/${c.body.id}?baseRev=1`, as: sam })
    const boot = await pullAll(h, sam, `event:${EVENT}`, ["comment"])
    expect(boot.changes).toEqual([])
    const delta = await pullAll(h, sam, `event:${EVENT}`, ["comment"], boot0.cursors)
    expect(delta.changes.map((e) => e.op)).toEqual(["upsert", "delete"])
    expect(delta.changes[1]).not.toHaveProperty("data")
  })

  it("pages a bootstrap in stable order and replays writes committed while paging", async () => {
    for (let i = 0; i < 7; i++) await post(sam, "comments", { id: id(), teamNumber: 100 + i, body: `c${i}` })
    const url = (cursors: object) =>
      `/api/v1/sync/changes?scope=event:${EVENT}&entities=comment&cursors=${encodeURIComponent(JSON.stringify(cursors))}&limit=3`
    const p1 = await h.req({ method: "GET", url: url({}), as: sam })
    expect(p1.body.changes).toHaveLength(3)
    expect(p1.body.hasMore).toBe(true)
    const mid = await post(sam, "comments", { id: id(), teamNumber: 999, body: "during" })
    const seen = [...p1.body.changes]
    let cur = p1.body.cursors
    for (;;) {
      const p = await h.req({ method: "GET", url: url(cur), as: sam })
      seen.push(...p.body.changes)
      cur = p.body.cursors
      if (!p.body.hasMore) break
    }
    expect(seen).toHaveLength(7)
    const delta = await h.req({ method: "GET", url: url(cur), as: sam })
    expect(delta.body.changes.map((e: { id: string }) => e.id)).toEqual([mid.body.id])
  })

  it("410 cursor_expired for a cursor older than the retention", async () => {
    const boot = await pullAll(h, sam, `event:${EVENT}`, ["comment"])
    const c = await post(sam, "comments", { id: id(), teamNumber: 254, body: "x" })
    await h.req({ method: "DELETE", url: `/api/v1/comments/${c.body.id}?baseRev=1`, as: sam })
    h.clock.advance(31 * 86_400_000)
    const { pruneChangeLog } = await import("../../src/jobs/maintenance.js")
    expect(pruneChangeLog(h.s.db, h.clock)).toBeGreaterThan(0)
    const fresh = await h.login("sam", "pw-sam-123", "dev2")
    const r = await pullAll(h, fresh, `event:${EVENT}`, ["comment"], boot.cursors)
    expect(r.status).toBe(410)
    expect(r.body.code).toBe("cursor_expired")
    // a bootstrap still works
    expect((await pullAll(h, fresh, `event:${EVENT}`, ["comment"])).status).toBe(200)
  })

  it("accepts base64url cursors and rejects bad scopes", async () => {
    const cursors = Buffer.from(JSON.stringify({ comment: "0" })).toString("base64url")
    const r = await h.req({ method: "GET", url: `/api/v1/sync/changes?scope=event:${EVENT}&entities=comment&cursors=${cursors}`, as: sam })
    expect(r.status).toBe(200)
    const bad = await h.req({ method: "GET", url: `/api/v1/sync/changes?scope=nope&entities=comment`, as: sam })
    expect(bad.status).toBe(400)
  })

  it("serves the user directory and own settings in the user scope", async () => {
    const r = await pullAll(h, sam, "user", ["user", "userSettings"])
    const users = r.changes.filter((e) => e.entity === "user").map((e) => e.data.username)
    expect(users).toEqual(expect.arrayContaining(["alex", "sam"]))
    const settings = r.changes.filter((e) => e.entity === "userSettings")
    expect(settings.map((e) => e.id)).toEqual([sam.userId])
    expect(settings[0].eventKey).toBeNull()
  })

  it("global scope carries events, teams and teamSettings", async () => {
    const r = await pullAll(h, sam, "global", ["event", "team", "teamSettings"])
    expect(r.changes.map((e) => e.entity)).toEqual(expect.arrayContaining(["event", "teamSettings"]))
  })
})

describe("batch push", () => {
  it("runs each op with its own idempotency", async () => {
    const e = scoutEntryBody()
    const c = { id: id(), teamNumber: 254, body: "batched" }
    const ops = [
      { opId: id(), method: "POST", path: `/events/${EVENT}/scout-entries`, body: e },
      { opId: id(), method: "POST", path: `/events/${EVENT}/comments`, body: c },
      { opId: id(), method: "DELETE", path: `/comments/${c.id}`, baseRev: 1 },
    ]
    const r = await h.req({ method: "POST", url: "/api/v1/sync/push", as: sam, body: { ops } })
    expect(r.status).toBe(200)
    expect(r.body.results.map((x: { status: number }) => x.status)).toEqual([201, 201, 200])
    const again = await h.req({ method: "POST", url: "/api/v1/sync/push", as: sam, body: { ops } })
    expect(again.body.results.map((x: { status: number }) => x.status)).toEqual([201, 201, 200])
  })
})
