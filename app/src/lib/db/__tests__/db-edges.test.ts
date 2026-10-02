import Dexie from "dexie"
import { describe, expect, it } from "vitest"
import { logger } from "@/lib/logger"
import { createTestDb } from "@/testing/db"
import { createDb } from "../db"
import { deleteDraft, openDraft } from "../drafts"
import { attachLogStore } from "../log-store"

describe("db lifecycle", () => {
  it("closes itself when another tab upgrades the schema", async () => {
    const name = "versionchange-test"
    const db = createDb(name)
    await db.open()
    const newer = new Dexie(name)
    newer.version(2).stores({ kv: "key" })
    await newer.open()
    expect(db.isOpen()).toBe(false)
    newer.close()
    await Dexie.delete(name)
  })
})

describe("drafts and logs", () => {
  it("deletes a draft", async () => {
    const db = createTestDb()
    const d = await openDraft(
      db,
      {
        userId: "u",
        kind: "pit",
        eventKey: "2026casj",
        context: { teamNumber: 254 },
        gameId: "g",
        schemaVersion: 1,
      },
      { now: 0, newId: () => "d1" }
    )
    await deleteDraft(db, d.id)
    expect(await db.drafts.count()).toBe(0)
  })

  it("trims persisted logs to the cap, keeping the newest", async () => {
    const db = createTestDb()
    const detach = attachLogStore(db, 1, 3)
    for (let i = 0; i < 5; i++) logger.info("t", `m${i}`)
    await detach()
    expect(
      (await db.logs.orderBy("id").toArray()).map((l) => l.message)
    ).toEqual(["m2", "m3", "m4"])
  })
})
