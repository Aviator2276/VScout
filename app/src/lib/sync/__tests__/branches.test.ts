// Small branch cases kept apart from the scenario tests.
import { describe, expect, it } from "vitest"
import { logger } from "@/lib/logger"
import { attachLogStore } from "@/lib/db/log-store"
import { openDraft, saveDraft } from "@/lib/db/drafts"
import { change } from "@/testing/changes"
import { createTestDb, testDeps } from "@/testing/db"
import { TEST_GAME, wirePostScouting } from "@/testing/factories/wire"
import { applyChanges } from "../apply-envelope"
import { recordConflict } from "../conflict-store"
import { enqueue } from "../outbox"

describe("branches", () => {
  it("saves a draft without changing its stage", async () => {
    const db = createTestDb()
    const d = await openDraft(
      db,
      {
        userId: "u",
        kind: "post",
        eventKey: "2026casj",
        context: {},
        gameId: TEST_GAME,
        schemaVersion: 2,
      },
      { now: 0, newId: () => "d" }
    )
    await saveDraft(db, d.id, { a: 1 }, 5)
    expect(await db.drafts.get("d")).toMatchObject({
      values: { a: 1 },
      updatedAt: 5,
    })
    expect((await db.drafts.get("d"))?.stage).toBeUndefined()
  })

  it("flushes pending log entries when detached early", async () => {
    const db = createTestDb()
    const detach = attachLogStore(db, 60_000)
    logger.info("t", "late")
    await detach()
    expect(await db.logs.count()).toBe(1)
  })

  it("adds patch keys to an update that had none", async () => {
    const db = createTestDb()
    const base = {
      opId: "a",
      userId: "u",
      entity: "userSettings",
      recordId: "u",
      eventKey: null,
      now: 0,
    }
    await enqueue(db, { ...base, kind: "update" })
    await enqueue(db, {
      ...base,
      opId: "b",
      kind: "update",
      patchKeys: ["theme"],
    })
    expect((await db.outbox.toArray())[0]?.patchKeys).toEqual(["theme"])
  })

  it("keeps server validation errors on a conflict", async () => {
    const db = createTestDb()
    const row = await recordConflict(
      db,
      {
        entity: "comment",
        recordId: "r",
        eventKey: null,
        kind: "rejected",
        source: "push",
        local: {},
        remote: null,
        baseRev: 0,
        remoteRev: null,
        serverErrors: [{ path: "body", code: "too_long", message: "Too long" }],
      },
      { now: 1, newId: () => "k" }
    )
    expect(row.serverErrors).toHaveLength(1)
  })

  it("validates post-scouting payloads from the server as experienced", async () => {
    const db = createTestDb()
    const { applyCtx } = testDeps(db)
    const post = wirePostScouting()
    await applyChanges([change("postScouting", post)], applyCtx)
    expect(await db.postScouting.get(post.id)).toMatchObject({
      schemaVersion: 2,
    })
  })
})
