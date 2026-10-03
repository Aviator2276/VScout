// flushOutbox with a stubbed ApiClient, for paths the MSW backend can't easily produce.
import { describe, expect, it } from "vitest"
import { ApiError, OfflineError } from "@/lib/api/errors"
import type { ApiClient } from "@/lib/api/api-client"
import { change } from "@/testing/changes"
import { TEST_USER, createTestDb, testDeps } from "@/testing/db"
import { wireComment } from "@/testing/factories/wire"
import { applyChanges } from "../apply-envelope"
import { createRecord, deleteRecord } from "../mutate"
import { flushOutbox } from "../push"

const comment = {
  eventKey: "2026casj",
  teamNumber: 254,
  body: "x",
  tags: [],
  visibility: "team" as const,
}

function setup(respond: ApiClient["request"]) {
  const db = createTestDb()
  const { deps, applyCtx } = testDeps(db)
  const push = {
    ...applyCtx,
    api: { request: respond },
    session: () => ({ userId: TEST_USER }),
    random: () => 0.5,
  }
  return { db, deps, applyCtx, push }
}

const ok = (body: unknown) =>
  Promise.resolve({
    status: 200,
    headers: {},
    body,
    transport: "http" as const,
    latencyMs: 1,
  })

describe("flushOutbox", () => {
  it("settles a delete into a synced tombstone", async () => {
    const { db, deps, applyCtx, push } = setup(() =>
      ok({ id: "x", rev: 3, deletedAt: "2026-03-20T15:00:00.000Z" })
    )
    const c = wireComment({ rev: 2, authorId: TEST_USER })
    await applyChanges([change("comment", c)], applyCtx)
    await deleteRecord(deps, "comment", c.id)
    expect((await flushOutbox(push)).sent).toBe(1)
    expect(await db.tombstones.get(["comment", c.id])).toMatchObject({
      rev: 3,
      syncState: "synced",
    })
    expect(await db.outbox.count()).toBe(0)
  })

  it("fails a delete whose answer has no rev", async () => {
    const { db, deps, applyCtx, push } = setup(() => ok({}))
    const c = wireComment({ rev: 2, authorId: TEST_USER })
    await applyChanges([change("comment", c)], applyCtx)
    await deleteRecord(deps, "comment", c.id)
    await flushOutbox(push)
    expect(await db.outbox.toArray()).toMatchObject([{ state: "failed" }])
  })

  it("requeues on unexpected errors and stops on offline", async () => {
    let n = 0
    const { db, deps, push } = setup(() => {
      n++
      return Promise.reject(
        n === 1 ? new TypeError("boom") : new OfflineError(["http:network"])
      )
    })
    await createRecord(deps, "comment", { ...comment, body: "a" })
    await createRecord(deps, "comment", { ...comment, body: "b" })
    await createRecord(deps, "comment", { ...comment, body: "c" })
    const r = await flushOutbox(push)
    expect(r.stoppedBy).toBe("offline")
    expect(
      (await db.outbox.orderBy("seq").toArray()).map((o) => o.attempts)
    ).toEqual([1, 1, 0])
  })

  it("treats a 409 without a server copy as a conflict with remote null", async () => {
    const { db, deps, push } = setup(() =>
      Promise.reject(
        new ApiError(
          { status: 409, code: "deleted", current: null },
          "http",
          null
        )
      )
    )
    await createRecord(deps, "comment", comment)
    await flushOutbox(push)
    expect(await db.conflicts.toArray()).toMatchObject([
      { kind: "deleted-remotely", remote: null },
    ])
  })

  it("rejects a create the server says doesn't exist (404) as rejected", async () => {
    const { db, deps, push } = setup(() =>
      Promise.reject(
        new ApiError({ status: 404, code: "not_found" }, "http", null)
      )
    )
    await createRecord(deps, "comment", comment)
    await flushOutbox(push)
    expect(await db.conflicts.toArray()).toMatchObject([{ kind: "rejected" }])
    expect(await db.outbox.toArray()).toMatchObject([{ state: "failed" }])
  })

  it("skips an op that an echo acked between listing and sealing", async () => {
    let calls = 0
    const { db, deps, push } = setup(() => {
      calls++
      return ok(null)
    })
    await createRecord(deps, "comment", comment)
    const wrapped = {
      ...push,
      // the echo removes the op right after the flush listed it
      session: () => {
        void db.outbox.clear()
        return { userId: TEST_USER }
      },
    }
    await flushOutbox(wrapped)
    expect(calls).toBe(0)
  })
})

describe("per-record ordering", () => {
  it("never sends a later op while an earlier one for the same record is stuck", async () => {
    let calls = 0
    const { db, deps, push } = setup(() => {
      calls++
      return ok(null)
    })
    const c = await createRecord(deps, "comment", comment)
    // the create was sent once and failed validation: the follow-up edit must wait for the user
    await db.outbox.toCollection().modify({ state: "failed", sealedBody: {} })
    await db.outbox.add({
      opId: "later",
      userId: TEST_USER,
      entity: "comment",
      recordId: c.id,
      recordKey: `comment:${c.id}`,
      eventKey: "2026casj",
      kind: "update",
      state: "queued",
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: 0,
    })
    expect(await flushOutbox(push)).toMatchObject({ sent: 0 })
    expect(calls).toBe(0)
  })
})

describe("more responses", () => {
  it("409 request_in_progress is retried after Retry-After, not a conflict (§4.1)", async () => {
    const { db, deps, push, applyCtx } = setup(() =>
      Promise.reject(
        new ApiError({ status: 409, code: "request_in_progress" }, "http", 1000)
      )
    )
    await createRecord(deps, "comment", comment)
    await flushOutbox(push)
    expect(await db.conflicts.count()).toBe(0)
    expect(await db.outbox.toArray()).toMatchObject([
      { state: "queued", attempts: 0, nextAttemptAt: applyCtx.now() + 1000 },
    ])
  })

  it("does nothing without a session", async () => {
    const { deps, push } = setup(() => ok(null))
    await createRecord(deps, "comment", comment)
    expect(await flushOutbox({ ...push, session: () => null })).toEqual({
      sent: 0,
      stoppedBy: null,
      needsRerun: false,
    })
  })

  it("keeps the code as the message when a server error has none", async () => {
    const { db, deps, push } = setup(() =>
      Promise.reject(
        new ApiError(
          {
            status: 422,
            code: "validation_failed",
            errors: [{ path: "body", code: "too_small" }],
          },
          "http",
          null
        )
      )
    )
    await createRecord(deps, "comment", comment)
    await flushOutbox(push)
    expect((await db.conflicts.toArray())[0]?.serverErrors).toEqual([
      { path: "body", code: "too_small", message: "too_small" },
    ])
  })
})
