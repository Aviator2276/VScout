import { afterEach, describe, expect, it } from "vitest"
import { clearLogs, recentLogs } from "@/lib/logger"
import { change } from "@/testing/changes"
import { TEST_USER, createTestDb, testDeps } from "@/testing/db"
import { TEST_GAME, wireComment, wireEvent } from "@/testing/factories/wire"
import { applyChanges, logApplyResults } from "../apply-envelope"
import { resolveConflict } from "../conflicts"
import { tablesFor } from "../entity-registry"
import { createRecord, deleteRecord, updateRecord } from "../mutate"

afterEach(() => clearLogs())

describe("sync edge cases", () => {
  it("acks the echo of my delete by settling the tombstone", async () => {
    const db = createTestDb()
    const { deps, applyCtx } = testDeps(db)
    const c = wireComment({ rev: 1, authorId: TEST_USER })
    await applyChanges([change("comment", c)], applyCtx)
    await deleteRecord(deps, "comment", c.id)
    const op = await db.outbox.toCollection().first()
    const r = await applyChanges(
      [change("comment", { ...c, rev: 2 }, { op: "delete", opId: op?.opId })],
      applyCtx
    )
    expect(r).toEqual(["echo-ack"])
    expect(await db.tombstones.get(["comment", c.id])).toMatchObject({
      rev: 2,
      syncState: "synced",
    })
  })

  it("an unrelated opId is not an echo", async () => {
    const db = createTestDb()
    const { deps, applyCtx } = testDeps(db)
    const mine = await createRecord(deps, "comment", {
      eventKey: "2026casj",
      teamNumber: 254,
      body: "a",
      tags: [],
      visibility: "team",
    })
    const op = await db.outbox.toCollection().first()
    const other = wireComment({ rev: 1 })
    expect(
      await applyChanges(
        [change("comment", other, { opId: op?.opId })],
        applyCtx
      )
    ).toEqual(["applied"])
    expect(await db.outbox.count()).toBe(1)
    expect((await db.comments.get(mine.id))?.syncState).toBe("pending")
  })

  it("reference data never conflicts and empty batches are a no-op", async () => {
    const db = createTestDb()
    const { applyCtx } = testDeps(db)
    expect(await applyChanges([], applyCtx)).toEqual([])
    expect(
      await applyChanges([change("event", wireEvent({ rev: 2 }))], applyCtx)
    ).toEqual(["applied"])
    expect(
      tablesFor(db, ["event", "event", "comment"]).map((t) => t.name)
    ).toEqual(["events", "comments"])
  })

  it("logs conflicts from a batch", () => {
    logApplyResults(["applied", "conflict", "conflict"], "mqtt")
    expect(recentLogs().at(-1)).toMatchObject({
      level: "warn",
      message: "2 conflict(s) from mqtt",
    })
    logApplyResults(["applied"], "mqtt")
    expect(recentLogs()).toHaveLength(1)
  })

  it("validates pit, post and playoff payloads with the right form and stage", async () => {
    const db = createTestDb()
    const { deps } = testDeps(db)
    const pit = await createRecord(deps, "pitScouting", {
      eventKey: "2026casj",
      teamNumber: 254,
      robot: { drivetrain: "swerve" },
      photos: [],
      gameId: TEST_GAME,
      schemaVersion: 2,
      data: { "pit.gizmoGrabber": "claw" },
    })
    expect(pit.syncState).toBe("pending")
    await expect(
      createRecord(deps, "postScouting", {
        eventKey: "2026casj",
        teamNumber: 254,
        gameId: TEST_GAME,
        schemaVersion: 2,
        data: { nope: 1 },
      })
    ).rejects.toThrow("Invalid postScouting data")
    const playoff = await createRecord(deps, "scoutEntry", {
      eventKey: "2026casj",
      matchKey: "2026casj_sf1m1",
      teamNumber: 254,
      station: "red1",
      scouterLevel: "experienced",
      tags: [],
      gameId: TEST_GAME,
      schemaVersion: 2,
      data: { "pre.noShow": true },
    })
    expect(playoff.matchKey).toBe("2026casj_sf1m1")
  })

  it("keep-mine needs a session; discard with a server copy restores it", async () => {
    const db = createTestDb()
    const { deps, applyCtx, clock, ids } = testDeps(db)
    const base = wireComment({ rev: 1, authorId: TEST_USER, body: "server" })
    await applyChanges([change("comment", base)], applyCtx)
    await updateRecord(deps, "comment", base.id, (r) => ({
      ...r,
      body: "mine",
    }))
    await applyChanges(
      [change("comment", { ...base, rev: 2, body: "theirs" })],
      applyCtx
    )
    const conflict = await db.conflicts.toCollection().first()
    const resolve = {
      db,
      now: clock.now,
      newId: ids.newId,
      session: () => null,
    }
    await expect(
      resolveConflict(resolve, conflict?.id ?? "", "keep-mine")
    ).rejects.toThrow("Sign in")
    await resolveConflict(resolve, conflict?.id ?? "", "discard")
    expect(await db.comments.get(base.id)).toMatchObject({
      body: "theirs",
      syncState: "synced",
    })
  })
})

describe("more write paths", () => {
  it("records dependencies on a create (photos before the pit entry)", async () => {
    const db = createTestDb()
    const { deps } = testDeps(db)
    await createRecord(
      deps,
      "comment",
      {
        eventKey: "2026casj",
        teamNumber: 254,
        body: "a",
        tags: [],
        visibility: "team",
      },
      {
        dependsOn: ["mediaAsset:m1"],
      }
    )
    expect((await db.outbox.toArray())[0]?.dependsOn).toEqual(["mediaAsset:m1"])
  })

  it("editing a conflicted server record resubmits an update", async () => {
    const db = createTestDb()
    const { deps, applyCtx } = testDeps(db)
    const base = wireComment({ rev: 2, authorId: TEST_USER })
    await applyChanges([change("comment", base)], applyCtx)
    await updateRecord(deps, "comment", base.id, (r) => ({
      ...r,
      body: "mine",
    }))
    await applyChanges(
      [change("comment", { ...base, rev: 3, body: "theirs" })],
      applyCtx
    )
    await updateRecord(deps, "comment", base.id, (r) => ({
      ...r,
      body: "merged by hand",
    }))
    expect(await db.outbox.toArray()).toMatchObject([
      { kind: "update", state: "queued" },
    ])
    expect(await db.conflicts.toArray()).toMatchObject([{ status: "resolved" }])
  })

  it("keep-mine for a rejected create sends a create again", async () => {
    const db = createTestDb()
    const { deps, clock, ids } = testDeps(db)
    const r = await createRecord(deps, "comment", {
      eventKey: "2026casj",
      teamNumber: 254,
      body: "a",
      tags: [],
      visibility: "team",
    })
    await db.conflicts.put({
      id: "k",
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
      blockedOpIds: (await db.outbox.toArray()).map((o) => o.opId),
    })
    await resolveConflict(
      {
        db,
        now: clock.now,
        newId: ids.newId,
        session: () => ({ userId: TEST_USER }),
      },
      "k",
      "keep-mine"
    )
    expect(await db.outbox.toArray()).toMatchObject([{ kind: "create" }])
  })
})
