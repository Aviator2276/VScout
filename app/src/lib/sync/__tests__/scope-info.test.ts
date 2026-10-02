import { describe, expect, it } from "vitest"
import { createTestDb } from "@/testing/db"
import { UNKNOWN_SCOPE, createScopeInfoStore } from "../scope-info"

describe("scope info store", () => {
  it("mirrors syncCursors and notifies on refresh", async () => {
    const db = createTestDb()
    const store = createScopeInfoStore(() => db)
    expect(store.get("global", "team")).toEqual(UNKNOWN_SCOPE)
    let n = 0
    const off = store.subscribe(() => n++)
    await db.syncCursors.put({
      scope: "global",
      entity: "team",
      cursor: "3",
      lastPulledAt: 42,
      bootstrapState: "done",
      forbidden: true,
    })
    await store.refresh()
    expect(store.get("global", "team")).toEqual({
      bootstrapState: "done",
      lastPulledAt: 42,
      forbidden: true,
    })
    expect([n, store.version()]).toEqual([1, 1])
    off()
  })
})
