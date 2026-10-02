import { describe, expect, it } from "vitest"
import { change } from "@/testing/changes"
import { TEST_USER, createTestDb, testDeps } from "@/testing/db"
import { wireComment } from "@/testing/factories/wire"
import { applyChanges } from "../apply-envelope"
import { resolveConflict } from "../conflicts"
import { createRecord, updateRecord } from "../mutate"

async function conflicted() {
  const db = createTestDb()
  const { deps, applyCtx, clock, ids } = testDeps(db)
  const base = wireComment({ rev: 2, authorId: TEST_USER, body: "server" })
  await applyChanges([change("comment", base)], applyCtx)
  await updateRecord(deps, "comment", base.id, (r) => ({ ...r, body: "mine" }))
  await applyChanges(
    [change("comment", { ...base, rev: 3, body: "theirs" })],
    applyCtx
  )
  const conflict = await db.conflicts.toCollection().first()
  if (!conflict) throw new Error("no conflict")
  const resolveDeps = {
    db,
    now: clock.now,
    newId: ids.newId,
    session: () => ({ userId: TEST_USER }),
  }
  return { db, base, conflict, resolveDeps, deps }
}

describe("resolveConflict (data-layer §11)", () => {
  it("keep mine: my values at the server's rev, the blocked ops replaced by one update", async () => {
    const { db, base, conflict, resolveDeps } = await conflicted()
    await resolveConflict(resolveDeps, conflict.id, "keep-mine")
    expect(await db.comments.get(base.id)).toMatchObject({
      body: "mine",
      rev: 3,
      syncState: "pending",
    })
    expect(await db.outbox.toArray()).toMatchObject([
      { kind: "update", state: "queued" },
    ])
    expect((await db.conflicts.get(conflict.id))?.status).toBe("resolved")
  })

  it("keep theirs: the server copy, synced, no ops", async () => {
    const { db, base, conflict, resolveDeps } = await conflicted()
    await resolveConflict(resolveDeps, conflict.id, "keep-theirs")
    expect(await db.comments.get(base.id)).toMatchObject({
      body: "theirs",
      rev: 3,
      syncState: "synced",
    })
    expect(await db.outbox.count()).toBe(0)
  })

  it("discard after a remote delete removes my copy and records the tombstone", async () => {
    const db = createTestDb()
    const { deps, applyCtx, clock, ids } = testDeps(db)
    const base = wireComment({ rev: 1, authorId: TEST_USER })
    await applyChanges([change("comment", base)], applyCtx)
    await updateRecord(deps, "comment", base.id, (r) => ({
      ...r,
      body: "edited",
    }))
    await applyChanges(
      [change("comment", { ...base, rev: 2 }, { op: "delete" })],
      applyCtx
    )
    const conflict = await db.conflicts.toCollection().first()
    await resolveConflict(
      {
        db,
        now: clock.now,
        newId: ids.newId,
        session: () => ({ userId: TEST_USER }),
      },
      conflict?.id ?? "",
      "discard"
    )
    expect(await db.comments.get(base.id)).toBeUndefined()
    expect(await db.tombstones.get(["comment", base.id])).toMatchObject({
      rev: 2,
      syncState: "synced",
    })
  })

  it("duplicate + keep mine writes my values onto the server's record", async () => {
    const db = createTestDb()
    const { deps, clock, ids } = testDeps(db)
    const mine = await createRecord(deps, "comment", {
      eventKey: "2026casj",
      teamNumber: 254,
      body: "mine",
      tags: [],
      visibility: "team",
    })
    const theirs = {
      ...mine,
      id: "server-id",
      rev: 4,
      body: "theirs",
      syncState: "synced",
    }
    await db.conflicts.add({
      id: "d1",
      entity: "comment",
      recordId: mine.id,
      eventKey: "2026casj",
      kind: "duplicate",
      source: "push",
      detectedAt: 0,
      status: "open",
      local: mine,
      remote: theirs,
      baseRev: 0,
      remoteRev: 4,
      blockedOpIds: (await db.outbox.toArray()).map((o) => o.opId),
    })
    await resolveConflict(
      {
        db,
        now: clock.now,
        newId: ids.newId,
        session: () => ({ userId: TEST_USER }),
      },
      "d1",
      "keep-mine"
    )
    expect(await db.comments.get(mine.id)).toBeUndefined()
    expect(await db.comments.get("server-id")).toMatchObject({
      body: "mine",
      rev: 4,
      syncState: "pending",
    })
    expect(await db.outbox.toArray()).toMatchObject([
      { recordId: "server-id", kind: "update" },
    ])
  })

  it("ignores unknown or already-resolved conflicts", async () => {
    const { db, conflict, resolveDeps } = await conflicted()
    await resolveConflict(resolveDeps, "missing", "keep-mine")
    await resolveConflict(resolveDeps, conflict.id, "keep-theirs")
    await resolveConflict(resolveDeps, conflict.id, "keep-mine")
    expect(await db.outbox.count()).toBe(0)
  })
})
