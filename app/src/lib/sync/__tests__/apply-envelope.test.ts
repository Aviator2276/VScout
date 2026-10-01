import { liveQuery } from "dexie"
import { describe, expect, it } from "vitest"
import { change } from "@/testing/changes"
import { TEST_USER, createTestDb, testDeps } from "@/testing/db"
import { resetIds } from "@/testing/factories/ids"
import {
  TEST_GAME,
  wireComment,
  wireMatch,
  wireScoutEntry,
  wireUserSettings,
} from "@/testing/factories/wire"
import { applyChanges } from "../apply-envelope"
import { createRecord, updateRecord } from "../mutate"

const settle = () => new Promise((r) => setTimeout(r, 30))

describe("applyEnvelope: the rev rule", () => {
  it("applies newer revisions and skips equal and older ones", async () => {
    const db = createTestDb()
    const { applyCtx } = testDeps(db)
    expect(
      await applyChanges(
        [change("match", wireMatch({ rev: 2, status: "queuing" }))],
        applyCtx
      )
    ).toEqual(["applied"])
    expect(
      await applyChanges(
        [change("match", wireMatch({ rev: 2, status: "played" }))],
        applyCtx
      )
    ).toEqual(["stale"])
    expect(
      await applyChanges(
        [change("match", wireMatch({ rev: 1, status: "played" }))],
        applyCtx
      )
    ).toEqual(["stale"])
    expect((await db.matches.get("2026casj_qm1"))?.status).toBe("queuing")
  })

  it("doesn't wake live queries for a duplicate delivery (MQTT + HTTP)", async () => {
    const db = createTestDb()
    const { applyCtx } = testDeps(db)
    await applyChanges([change("match", wireMatch({ rev: 3 }))], applyCtx)
    let emissions = 0
    const sub = liveQuery(() => db.matches.toArray()).subscribe(
      () => emissions++
    )
    await settle()
    const before = emissions
    await applyChanges([change("match", wireMatch({ rev: 3 }))], applyCtx)
    await settle()
    expect(emissions).toBe(before)
    sub.unsubscribe()
  })

  it("turns a delete into a tombstone and ignores an older upsert afterwards", async () => {
    const db = createTestDb()
    const { applyCtx } = testDeps(db)
    const c = wireComment({ rev: 1 })
    await applyChanges([change("comment", c)], applyCtx)
    await applyChanges(
      [change("comment", { ...c, rev: 4 }, { op: "delete" })],
      applyCtx
    )
    expect(await db.comments.get(c.id)).toBeUndefined()
    expect(await db.tombstones.get(["comment", c.id])).toMatchObject({
      rev: 4,
      syncState: "synced",
    })
    expect(
      await applyChanges([change("comment", { ...c, rev: 3 })], applyCtx)
    ).toEqual(["stale"])
    // a restore (undo after sync) comes back at a higher rev and removes the tombstone
    expect(
      await applyChanges([change("comment", { ...c, rev: 5 })], applyCtx)
    ).toEqual(["applied"])
    expect(await db.tombstones.get(["comment", c.id])).toBeUndefined()
  })
})

describe("applyEnvelope: local edits", () => {
  it("acks our own write from its echo (ADR-017) and marks the record synced", async () => {
    resetIds()
    const db = createTestDb()
    const { deps, applyCtx } = testDeps(db)
    const created = await createRecord(deps, "comment", {
      eventKey: "2026casj",
      teamNumber: 254,
      body: "Fast",
      tags: [],
      visibility: "team",
    })
    const op = await db.outbox.toCollection().first()
    const echo = wireComment({
      id: created.id,
      rev: 1,
      authorId: TEST_USER,
      body: "Fast",
    })
    expect(
      await applyChanges(
        [change("comment", echo, { opId: op?.opId })],
        applyCtx
      )
    ).toEqual(["echo-ack"])
    expect(await db.outbox.count()).toBe(0)
    expect(await db.comments.get(created.id)).toMatchObject({
      rev: 1,
      syncState: "synced",
    })
  })

  it("keeps later local edits when an earlier op is echoed (rebase rev only)", async () => {
    const db = createTestDb()
    const { deps, applyCtx } = testDeps(db)
    const created = await createRecord(deps, "comment", {
      eventKey: "2026casj",
      teamNumber: 254,
      body: "v1",
      tags: [],
      visibility: "team",
    })
    const first = await db.outbox.toCollection().first()
    await db.outbox.toCollection().modify({ state: "inflight", sealedBody: {} }) // sent, not acked
    await updateRecord(deps, "comment", created.id, (r) => ({
      ...r,
      body: "v2",
    }))
    const echo = wireComment({ id: created.id, rev: 1, body: "v1" })
    expect(
      await applyChanges(
        [change("comment", echo, { opId: first?.opId })],
        applyCtx
      )
    ).toEqual(["echo-ack"])
    expect(await db.comments.get(created.id)).toMatchObject({
      body: "v2",
      rev: 1,
      syncState: "pending",
    })
    expect(await db.outbox.count()).toBe(1)
  })

  it("turns a newer foreign change over unsent edits into a conflict and blocks the ops", async () => {
    const db = createTestDb()
    const { deps, applyCtx } = testDeps(db)
    const base = wireComment({ rev: 2, authorId: TEST_USER, body: "server" })
    await applyChanges([change("comment", base)], applyCtx)
    await updateRecord(deps, "comment", base.id, (r) => ({
      ...r,
      body: "mine",
    }))
    const result = await applyChanges(
      [change("comment", { ...base, rev: 3, body: "theirs" })],
      applyCtx
    )
    expect(result).toEqual(["conflict"])
    expect(await db.comments.get(base.id)).toMatchObject({
      body: "mine",
      syncState: "conflict",
    })
    expect(await db.conflicts.toArray()).toMatchObject([
      {
        kind: "rev-mismatch",
        baseRev: 2,
        remoteRev: 3,
        status: "open",
        remote: { body: "theirs" },
      },
    ])
    expect((await db.outbox.toArray()).map((o) => o.state)).toEqual(["blocked"])
    // a second newer change updates the same open conflict
    await applyChanges(
      [change("comment", { ...base, rev: 4, body: "newer" })],
      applyCtx
    )
    expect(await db.conflicts.toArray()).toMatchObject([{ remoteRev: 4 }])
  })

  it("records deleted-remotely when the server deletes a record I edited", async () => {
    const db = createTestDb()
    const { deps, applyCtx } = testDeps(db)
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
    expect(await db.conflicts.toArray()).toMatchObject([
      { kind: "deleted-remotely", remote: null },
    ])
  })

  it("merges userSettings: server document plus the keys I'm still sending, never a conflict", async () => {
    const db = createTestDb()
    const { applyCtx } = testDeps(db)
    await applyChanges(
      [change("userSettings", wireUserSettings({ rev: 1, theme: "light" }))],
      applyCtx
    )
    await db.userSettings.update(TEST_USER, {
      theme: "dark",
      syncState: "pending",
    })
    await db.outbox.add({
      opId: "op1",
      userId: TEST_USER,
      entity: "userSettings",
      recordId: TEST_USER,
      recordKey: `userSettings:${TEST_USER}`,
      eventKey: null,
      kind: "update",
      patchKeys: ["theme"],
      state: "queued",
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: 0,
    })
    const r = await applyChanges(
      [
        change(
          "userSettings",
          wireUserSettings({ rev: 2, theme: "light", celebrate: false })
        ),
      ],
      applyCtx
    )
    expect(r).toEqual(["applied"])
    expect(await db.userSettings.get(TEST_USER)).toMatchObject({
      rev: 2,
      theme: "dark",
      celebrate: false,
      syncState: "pending",
    })
    expect(await db.conflicts.count()).toBe(0)
  })
})

describe("applyEnvelope: game payloads (data-layer §5)", () => {
  it("migrates an older schemaVersion to the current one on ingest", async () => {
    const db = createTestDb()
    const { applyCtx } = testDeps(db)
    const old = wireScoutEntry({
      schemaVersion: 1,
      data: { "pre.noShow": false, "teleop.job": "defense" },
    })
    await applyChanges([change("scoutEntry", old)], applyCtx)
    expect(await db.scoutEntries.get(old.id)).toMatchObject({
      schemaVersion: 2,
      data: { "pre.noShow": false, "teleop.role": "defense" },
    })
  })

  it("stores newer or unknown payloads raw and flags them unsupported", async () => {
    const db = createTestDb()
    const { applyCtx } = testDeps(db)
    const newer = wireScoutEntry({ schemaVersion: 9 })
    const unknown = wireScoutEntry({ gameId: "2031-future" })
    await applyChanges(
      [change("scoutEntry", newer), change("scoutEntry", unknown)],
      applyCtx
    )
    expect(await db.scoutEntries.get(newer.id)).toMatchObject({
      unsupported: true,
      schemaVersion: 9,
    })
    expect(await db.scoutEntries.get(unknown.id)).toMatchObject({
      unsupported: true,
      gameId: "2031-future",
    })
  })

  it("keeps an invalid payload (the server is the source of record)", async () => {
    const db = createTestDb()
    const { applyCtx } = testDeps(db)
    const bad = wireScoutEntry({
      gameId: TEST_GAME,
      schemaVersion: 2,
      data: { nonsense: 1 },
    })
    await applyChanges([change("scoutEntry", bad)], applyCtx)
    expect(await db.scoutEntries.get(bad.id)).toMatchObject({
      data: { nonsense: 1 },
    })
  })
})
