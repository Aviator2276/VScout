import { describe, expect, it } from "vitest"
import { TEST_USER, createTestDb } from "@/testing/db"
import { TEST_GAME } from "@/testing/factories/wire"
import { listDrafts, openDraft, saveDraft } from "../drafts"
import { getKv, setKv } from "../kv"
import { LATEST_VERSION } from "../migrations/register"
import { stores } from "../migrations/v001"
import { stores as storesV2 } from "../migrations/v002"
import {
  purgeEvent,
  purgeOldTombstones,
  purgeResolvedConflicts,
} from "../retention"
import { DB_NAME, getDb } from "../db"

describe("schema versions", () => {
  it("declares the frozen v1 stores (edit a shipped version → this fails; add v002 instead)", () => {
    expect(stores).toMatchSnapshot()
  })

  it("v2 adds the device-only notifications table, and the database opens at the latest", async () => {
    expect(storesV2).toMatchSnapshot()
    const db = createTestDb()
    await db.open()
    expect(db.verno).toBe(LATEST_VERSION)
    expect(LATEST_VERSION).toBe(2)
    expect([...Object.keys(stores), ...Object.keys(storesV2)].sort()).toEqual(
      db.tables.map((t) => t.name).sort()
    )
  })

  it("opens the v2 database name lazily", () => {
    expect(DB_NAME).toBe("vscout2")
    expect(getDb()).toBe(getDb())
  })
})

describe("kv", () => {
  it("stores typed bookkeeping values", async () => {
    const db = createTestDb()
    await setKv(db, "pinnedEventKeys", ["2026casj"])
    expect(await getKv(db, "pinnedEventKeys")).toEqual(["2026casj"])
    expect(await getKv(db, "deviceId")).toBeUndefined()
  })
})

describe("drafts", () => {
  const key = {
    userId: TEST_USER,
    kind: "match" as const,
    eventKey: "2026casj",
    context: { matchKey: "2026casj_qm1", teamNumber: 254 },
    gameId: TEST_GAME,
    schemaVersion: 2,
  }

  it("resumes the same context and keeps drafts per user", async () => {
    const db = createTestDb()
    const ids = ["d1", "d2", "d3"]
    const newId = () => ids.shift() ?? "x"
    const a = await openDraft(db, key, { now: 1, newId })
    expect((await openDraft(db, key, { now: 2, newId })).id).toBe(a.id)
    await openDraft(
      db,
      { ...key, context: { matchKey: "2026casj_qm2", teamNumber: 254 } },
      { now: 3, newId }
    )
    await openDraft(db, { ...key, userId: "someone-else" }, { now: 4, newId })
    await saveDraft(db, a.id, { "pre.noShow": true }, 10, "pre")
    const mine = await listDrafts(db, TEST_USER, "2026casj")
    expect(mine.map((d) => d.id)).toEqual(["d1", "d2"])
    expect(mine[0]).toMatchObject({
      values: { "pre.noShow": true },
      stage: "pre",
      updatedAt: 10,
    })
  })
})

describe("retention", () => {
  it("refuses to purge an event with unsynced work, purges it otherwise", async () => {
    const db = createTestDb()
    await db.matches.put({ key: "2026casj_qm1", eventKey: "2026casj" } as never)
    await db.matches.put({ key: "2026abc_qm1", eventKey: "2026abc" } as never)
    await db.drafts.put({
      id: "d",
      userId: "u",
      kind: "match",
      eventKey: "2026casj",
      context: {},
      values: {},
      gameId: "g",
      schemaVersion: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    expect(await purgeEvent(db, "2026casj")).toEqual({
      ok: false,
      reason: "unsynced-work",
    })
    await db.drafts.clear()
    expect(await purgeEvent(db, "2026casj")).toEqual({ ok: true, deleted: 1 })
    expect(await db.matches.count()).toBe(1)
  })

  it("garbage-collects old synced tombstones and resolved conflicts only", async () => {
    const db = createTestDb()
    const day = 24 * 60 * 60 * 1000
    const now = 100 * day
    await db.tombstones.bulkPut([
      {
        entity: "comment",
        id: "old",
        rev: 1,
        deletedAt: now - 31 * day,
        eventKey: null,
        syncState: "synced",
      },
      {
        entity: "comment",
        id: "pending",
        rev: 1,
        deletedAt: now - 31 * day,
        eventKey: null,
        syncState: "pending",
      },
      {
        entity: "comment",
        id: "new",
        rev: 1,
        deletedAt: now - day,
        eventKey: null,
        syncState: "synced",
      },
    ])
    expect(await purgeOldTombstones(db, now)).toBe(1)
    const base = {
      entity: "comment",
      recordId: "r",
      eventKey: null,
      kind: "rejected" as const,
      source: "push" as const,
      detectedAt: 0,
      local: null,
      remote: null,
      baseRev: 0,
      remoteRev: null,
      blockedOpIds: [],
    }
    await db.conflicts.bulkPut([
      { ...base, id: "a", status: "resolved", resolvedAt: now - 8 * day },
      { ...base, id: "b", status: "resolved", resolvedAt: now - day },
      { ...base, id: "c", status: "open" },
    ])
    expect(await purgeResolvedConflicts(db, now)).toBe(1)
  })
})
