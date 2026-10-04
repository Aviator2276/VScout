import { describe, expect, it } from "vitest"
import { createTestDb } from "@/testing/db"
import { toDomain } from "@/testing/factories/records"
import {
  TEST_EVENT,
  wireEventSettings,
  wirePicklist,
} from "@/testing/factories/wire"
import { followedPicklistId, masterOf } from "../followed-picklist"

const list = (id: string, o: Record<string, unknown> = {}) =>
  toDomain("picklist", wirePicklist({ id, ...o }))

describe("followed picklist (ADR-080)", () => {
  it("the first-pick master list wins over the admin pointer", async () => {
    const db = createTestDb()
    await db.eventSettings.put(
      toDomain("eventSettings", wireEventSettings({ followedPicklistId: "p1" }))
    )
    await db.picklists.bulkPut([list("p1"), list("m2", { master: true })])
    expect(await followedPicklistId(db, TEST_EVENT)).toBe("m2")
  })

  it("falls back to the pointer, then to none", async () => {
    const db = createTestDb()
    expect(await followedPicklistId(db, TEST_EVENT)).toBeNull()
    await db.picklists.put(list("m", { master: true, purpose: "second" }))
    await db.eventSettings.put(
      toDomain("eventSettings", wireEventSettings({ followedPicklistId: "p" }))
    )
    expect(await followedPicklistId(db, TEST_EVENT)).toBe("p")
  })

  it("two master lists resolve to the older one, then the lower id", () => {
    const older = list("z", {
      master: true,
      createdAt: "2026-03-01T00:00:00.000Z",
    })
    const newer = list("a", {
      master: true,
      createdAt: "2026-03-02T00:00:00.000Z",
    })
    expect(masterOf([newer, older], "first")?.id).toBe("z")
    const twin = list("b", { master: true })
    const twin2 = list("c", { master: true })
    expect(masterOf([twin2, twin], "first")?.id).toBe("b")
    expect(masterOf([twin2, twin], "second")).toBeNull()
  })
})
