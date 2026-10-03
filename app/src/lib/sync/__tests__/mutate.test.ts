import { describe, expect, it } from "vitest"
import { change } from "@/testing/changes"
import { TEST_USER, createTestDb, testDeps } from "@/testing/db"
import { TEST_GAME, wireComment } from "@/testing/factories/wire"
import { openDraft } from "@/lib/db/drafts"
import { applyChanges } from "../apply-envelope"
import {
  NotAllowedError,
  RecordNotFoundError,
  ValidationError,
} from "../errors"
import { createRecord, deleteRecord, updateRecord } from "../mutate"

const comment = {
  eventKey: "2026casj",
  teamNumber: 254,
  body: "Fast",
  tags: [],
  visibility: "team" as const,
}
const entry = {
  eventKey: "2026casj",
  matchKey: "2026casj_qm3",
  teamNumber: 254,
  station: "red1" as const,
  scouterLevel: "new" as const,
  tags: [],
  gameId: TEST_GAME,
  schemaVersion: 2,
}

describe("createRecord", () => {
  it("writes a pending record and one create op in one transaction", async () => {
    const db = createTestDb()
    const { deps } = testDeps(db)
    let writes = 0
    const r = await createRecord(
      { ...deps, onWrite: () => writes++ },
      "comment",
      comment
    )
    expect(await db.comments.get(r.id)).toMatchObject({
      rev: 0,
      syncState: "pending",
      authorId: TEST_USER,
    })
    expect(await db.outbox.toArray()).toMatchObject([
      { kind: "create", recordKey: `comment:${r.id}`, userId: TEST_USER },
    ])
    expect(writes).toBe(1)
  })

  it("validates core fields and the game form before touching the database", async () => {
    const db = createTestDb()
    const { deps } = testDeps(db)
    await expect(
      createRecord(deps, "comment", { ...comment, body: "" })
    ).rejects.toBeInstanceOf(ValidationError)
    // new scouters must rate auto (test game: required for 'new')
    await expect(
      createRecord(deps, "scoutEntry", {
        ...entry,
        data: { "pre.noShow": false },
      })
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      createRecord(deps, "scoutEntry", {
        ...entry,
        gameId: "2031-future",
        data: {},
      })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(await db.outbox.count()).toBe(0)
    expect(await db.scoutEntries.count()).toBe(0)
    const ok = await createRecord(deps, "scoutEntry", {
      ...entry,
      data: { "pre.noShow": false, "auto.effectiveness": 3 },
    })
    expect(ok.syncState).toBe("pending")
  })

  it("needs a session and respects the client RBAC check", async () => {
    const db = createTestDb()
    const { deps } = testDeps(db)
    await expect(
      createRecord({ ...deps, session: () => null }, "comment", comment)
    ).rejects.toBeInstanceOf(NotAllowedError)
    await expect(
      createRecord({ ...deps, authorize: () => false }, "comment", comment)
    ).rejects.toBeInstanceOf(NotAllowedError)
  })

  it("submitting a draft creates the record with the draft's id and deletes the draft atomically", async () => {
    const db = createTestDb()
    const { deps } = testDeps(db)
    const draft = await openDraft(
      db,
      {
        userId: TEST_USER,
        kind: "comment",
        eventKey: "2026casj",
        context: { teamNumber: 254 },
        gameId: TEST_GAME,
        schemaVersion: 2,
      },
      { now: 0, newId: () => "draft-1" }
    )
    const r = await createRecord(deps, "comment", comment, {
      fromDraftId: draft.id,
    })
    expect(r.id).toBe("draft-1")
    expect(await db.drafts.count()).toBe(0)
  })
})

describe("updateRecord and deleteRecord", () => {
  it("coalesces edits of an unsent record into its create", async () => {
    const db = createTestDb()
    const { deps } = testDeps(db)
    const r = await createRecord(deps, "comment", comment)
    await updateRecord(deps, "comment", r.id, (c) => ({ ...c, body: "Faster" }))
    expect((await db.outbox.toArray()).map((o) => o.kind)).toEqual(["create"])
    expect((await db.comments.get(r.id))?.body).toBe("Faster")
  })

  it("deleting an unsent record drops it with its op and leaves no tombstone", async () => {
    const db = createTestDb()
    const { deps } = testDeps(db)
    const r = await createRecord(deps, "comment", comment)
    await deleteRecord(deps, "comment", r.id)
    expect(await db.outbox.count()).toBe(0)
    expect(await db.tombstones.count()).toBe(0)
  })

  it("deleting a synced record keeps a pending tombstone with a snapshot (Undo, rejected deletes)", async () => {
    const db = createTestDb()
    const { deps, applyCtx } = testDeps(db)
    const c = wireComment({ rev: 3, authorId: TEST_USER })
    await applyChanges([change("comment", c)], applyCtx)
    await deleteRecord(deps, "comment", c.id)
    expect(await db.tombstones.get(["comment", c.id])).toMatchObject({
      rev: 3,
      syncState: "pending",
      snapshot: { id: c.id },
    })
    expect((await db.outbox.toArray()).map((o) => o.kind)).toEqual(["delete"])
  })

  it("throws for missing records and keeps server meta on update", async () => {
    const db = createTestDb()
    const { deps, applyCtx } = testDeps(db)
    await expect(
      updateRecord(deps, "comment", "nope", (c) => c)
    ).rejects.toBeInstanceOf(RecordNotFoundError)
    await expect(deleteRecord(deps, "comment", "nope")).rejects.toBeInstanceOf(
      RecordNotFoundError
    )
    const c = wireComment({ rev: 2, authorId: TEST_USER })
    await applyChanges([change("comment", c)], applyCtx)
    const r = await updateRecord(deps, "comment", c.id, (x) => ({
      ...x,
      rev: 99,
      authorId: "someone-else",
    }))
    expect(r).toMatchObject({
      rev: 2,
      authorId: TEST_USER,
      syncState: "pending",
    })
  })

  it("edit-and-retry after a rejection resends a create for a record the server never accepted", async () => {
    const db = createTestDb()
    const { deps } = testDeps(db)
    const r = await createRecord(deps, "comment", comment)
    await db.outbox.toCollection().modify({ state: "failed", sealedBody: {} })
    await db.comments.update(r.id, { syncState: "rejected" })
    await db.conflicts.add({
      id: "k1",
      entity: "comment",
      recordId: r.id,
      eventKey: "2026casj",
      kind: "rejected",
      source: "push",
      detectedAt: 0,
      status: "open",
      local: r,
      remote: null,
      baseRev: 0,
      remoteRev: null,
      blockedOpIds: [],
    })
    await updateRecord(deps, "comment", r.id, (c) => ({ ...c, body: "Fixed" }))
    expect(await db.outbox.toArray()).toMatchObject([
      { kind: "create", state: "queued" },
    ])
    expect((await db.conflicts.get("k1"))?.status).toBe("resolved")
  })
})
