import { describe, expect, it } from "vitest"
import { createTestDb } from "@/testing/db"
import { enqueue, resetInflightOps } from "../outbox"
import type { EnqueueInput } from "../outbox"
import type { OutboxKind } from "@/lib/db/types"

let n = 0
const input = (
  kind: OutboxKind,
  extra: Partial<EnqueueInput> = {}
): EnqueueInput => ({
  opId: `op-${++n}`,
  userId: "u1",
  entity: "comment",
  recordId: "c1",
  eventKey: "2026casj",
  kind,
  now: 1000,
  ...extra,
})

describe("outbox coalescing (data-layer §8.2)", () => {
  it.each([
    ["create", "update", "coalesced", ["create"]],
    ["create", "delete", "dropped-create", []],
    ["update", "update", "coalesced", ["update"]],
    ["update", "delete", "coalesced", ["delete"]],
    ["delete", "create", "appended", ["delete", "create"]],
  ] as const)("%s then %s → %s", async (first, second, result, kinds) => {
    const db = createTestDb()
    await db.transaction("rw", db.outbox, async () => {
      await enqueue(db, input(first))
      expect(await enqueue(db, input(second))).toBe(result)
    })
    expect(
      (await db.outbox.orderBy("seq").toArray()).map((o) => o.kind)
    ).toEqual(kinds)
  })

  it("never coalesces into a sealed or inflight op (its body is frozen for idempotency)", async () => {
    const db = createTestDb()
    await enqueue(db, input("update"))
    await db.outbox
      .toCollection()
      .modify({ sealedBody: { body: "v1" }, baseRev: 1 })
    expect(await enqueue(db, input("update"))).toBe("appended")
    await db.outbox.toCollection().modify({ state: "inflight" })
    expect(await enqueue(db, input("update"))).toBe("appended")
    expect(await db.outbox.count()).toBe(3)
  })

  it("unions patch keys of coalesced userSettings updates", async () => {
    const db = createTestDb()
    await enqueue(
      db,
      input("update", { entity: "userSettings", patchKeys: ["theme"] })
    )
    await enqueue(
      db,
      input("update", {
        entity: "userSettings",
        patchKeys: ["celebrate", "theme"],
      })
    )
    expect((await db.outbox.toArray())[0]?.patchKeys).toEqual([
      "theme",
      "celebrate",
    ])
  })

  it("only coalesces ops of the same record", async () => {
    const db = createTestDb()
    await enqueue(db, input("update"))
    expect(await enqueue(db, input("update", { recordId: "c2" }))).toBe(
      "appended"
    )
  })

  it("boot recovery puts inflight ops back in the queue", async () => {
    const db = createTestDb()
    await enqueue(db, input("create"))
    await db.outbox.toCollection().modify({ state: "inflight" })
    expect(await resetInflightOps(db)).toBe(1)
    expect((await db.outbox.toArray())[0]?.state).toBe("queued")
  })
})
