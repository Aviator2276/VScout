// Retry Now and Discard from the Sync sheet (features/sync-status.md criterion 9).
import { describe, expect, it } from "vitest"
import { change } from "@/testing/changes"
import { TEST_USER, createTestDb, testDeps } from "@/testing/db"
import { wireComment } from "@/testing/factories/wire"
import { applyChanges } from "../apply-envelope"
import { createRecord, updateRecord } from "../mutate"
import { canDiscard, discardUnsentCreate, retryNow } from "../outbox-actions"

async function setup() {
  const db = createTestDb()
  const { deps, applyCtx } = testDeps(db)
  return { db, deps, applyCtx }
}

describe("outbox actions", () => {
  it("a new record never sent can be discarded: op and local record go", async () => {
    const { db, deps } = await setup()
    const rec = await createRecord(deps, "comment", {
      eventKey: "2026casj",
      teamNumber: 254,
      body: "hi",
      visibility: "team",
    } as never)
    const op = await db.outbox.toCollection().first()
    if (!op) throw new Error("no op")
    expect(await db.comments.get(rec.id)).toBeDefined()
    expect(canDiscard(op)).toBe(true)
    expect(await discardUnsentCreate(db, op)).toBe(true)
    expect(await db.outbox.count()).toBe(0)
    expect(await db.comments.get(rec.id)).toBeUndefined()
  })

  it("an update, or a create already attempted, can't be discarded", async () => {
    const { db, deps, applyCtx } = await setup()
    const base = wireComment({ rev: 1, authorId: TEST_USER })
    await applyChanges([change("comment", base)], applyCtx)
    await updateRecord(deps, "comment", base.id, (r) => ({ ...r, body: "x" }))
    const update = await db.outbox.toCollection().first()
    if (!update) throw new Error("no op")
    expect(canDiscard(update)).toBe(false)
    expect(await discardUnsentCreate(db, update)).toBe(false)
    expect(canDiscard({ ...update, kind: "create", attempts: 1 })).toBe(false)
    expect(canDiscard({ ...update, kind: "create", sealedBody: {} })).toBe(
      false
    )
    expect(canDiscard({ ...update, kind: "create", state: "inflight" })).toBe(
      false
    )
    expect(
      await discardUnsentCreate(db, {
        ...update,
        kind: "create",
        entity: "nope",
      })
    ).toBe(false)
  })

  it("Retry Now clears the backoff of a waiting op only", async () => {
    const { db, deps, applyCtx } = await setup()
    const base = wireComment({ rev: 1, authorId: TEST_USER })
    await applyChanges([change("comment", base)], applyCtx)
    await updateRecord(deps, "comment", base.id, (r) => ({ ...r, body: "x" }))
    const op = await db.outbox.toCollection().first()
    if (!op?.seq) throw new Error("no op")
    await db.outbox.update(op.seq, { nextAttemptAt: 99_999 })
    await retryNow(db, op, 5)
    expect((await db.outbox.get(op.seq))?.nextAttemptAt).toBe(5)
    await db.outbox.update(op.seq, { nextAttemptAt: 99_999 })
    await retryNow(db, { ...op, state: "failed" }, 5)
    await retryNow(db, { state: "queued" }, 5)
    expect((await db.outbox.get(op.seq))?.nextAttemptAt).toBe(99_999)
  })
})
