import { describe, expect, it } from "vitest"
import { createTestDb } from "@/testing/db"
import { purgeEvent } from "../retention"

describe("purgeEvent safety", () => {
  it.each(["comments", "picklists", "reactions", "messages"] as const)(
    "refuses while a %s row is unsynced",
    async (table) => {
      const db = createTestDb()
      await db
        .table(table)
        .put({ id: "r1", eventKey: "2026casj", syncState: "pending" })
      expect(await purgeEvent(db, "2026casj")).toEqual({
        ok: false,
        reason: "unsynced-work",
      })
    }
  )

  it("refuses with an open conflict, and deletes in chunks otherwise", async () => {
    const db = createTestDb()
    await db.conflicts.put({
      id: "c",
      entity: "comment",
      recordId: "r",
      eventKey: "2026casj",
      kind: "rejected",
      source: "push",
      detectedAt: 0,
      status: "open",
      local: null,
      remote: null,
      baseRev: 0,
      remoteRev: null,
      blockedOpIds: [],
    })
    expect((await purgeEvent(db, "2026casj")).ok).toBe(false)
    await db.conflicts.clear()
    await db.matches.bulkPut(
      Array.from(
        { length: 2100 },
        (_, i) => ({ key: `2026casj_qm${i}`, eventKey: "2026casj" }) as never
      )
    )
    expect(await purgeEvent(db, "2026casj")).toEqual({
      ok: true,
      deleted: 2100,
    })
  }, 20_000) // 2,100 rows: slow under coverage instrumentation
})
