import { describe, expect, it } from "vitest"
import { createTestDb } from "@/testing/db"
import {
  dismiss,
  markGroupRead,
  markRead,
  markUnread,
  notify,
  orderNotifications,
  prune,
  remove,
  retract,
  summarize,
} from "../api/notifications-store"
import type { NotifyInput } from "../api/notifications-store"

const DAY = 86_400_000
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a row")
  return value
}
let n = 0
const ids = { newId: () => `id-${++n}` }
const input = (o: Partial<NotifyInput> = {}): NotifyInput => ({
  key: "msg:1",
  category: "messages",
  priority: "normal",
  title: "Sam in #event",
  body: "Q14 queue moved",
  ...o,
})

describe("notification store (notifications-center.md N1)", () => {
  it("creates once per key, and a dismissed key stays dismissed (criterion 12)", async () => {
    const db = createTestDb()
    const a = await notify(db, input(), { now: 10, ids })
    expect(a?.readAt).toBeUndefined()
    expect(
      await notify(db, input({ title: "again" }), { now: 20, ids })
    ).toBeNull()
    await dismiss(db, [must(a).id], 30)
    expect(await notify(db, input(), { now: 40, ids })).toBeNull()
    expect((await db.notifications.toArray()).map((r) => r.title)).toEqual([
      "Sam in #event",
    ])
  })

  it("a deleted or retracted key can notify again", async () => {
    const db = createTestDb()
    const a = await notify(db, input(), { now: 10, ids })
    await remove(db, [must(a).id])
    expect(await notify(db, input(), { now: 20, ids })).not.toBeNull()
    await retract(db, "msg:1")
    expect(await db.notifications.count()).toBe(0)
  })

  it("system items refresh in place; a higher priority makes them unread again", async () => {
    const db = createTestDb()
    const opts = { now: 10, ids, refresh: true }
    const a = await notify(
      db,
      input({ key: "system:expiry", category: "system", priority: "high" }),
      opts
    )
    await markRead(db, [must(a).id], 11)
    await notify(
      db,
      input({
        key: "system:expiry",
        category: "system",
        priority: "high",
        body: "1 hour",
      }),
      { ...opts, now: 12 }
    )
    let row = await db.notifications.get(must(a).id)
    expect(row?.body).toBe("1 hour")
    expect(row?.readAt).toBe(11)
    await notify(
      db,
      input({ key: "system:expiry", category: "system", priority: "critical" }),
      { ...opts, now: 13 }
    )
    row = await db.notifications.get(must(a).id)
    expect(row?.priority).toBe("critical")
    expect(row?.readAt).toBeUndefined()
  })

  it("read, unread, and read by group (criterion 14)", async () => {
    const db = createTestDb()
    const a = await notify(db, input({ key: "msg:1", group: "event:x" }), {
      now: 1,
      ids,
    })
    const b = await notify(db, input({ key: "msg:2", group: "event:x" }), {
      now: 2,
      ids,
    })
    const c = await notify(db, input({ key: "msg:3", group: "dm:a:b" }), {
      now: 3,
      ids,
    })
    await markGroupRead(db, "event:x", 5)
    expect((await db.notifications.get(must(a).id))?.readAt).toBe(5)
    expect((await db.notifications.get(must(b).id))?.readAt).toBe(5)
    expect((await db.notifications.get(must(c).id))?.readAt).toBeUndefined()
    await markUnread(db, [must(a).id])
    expect((await db.notifications.get(must(a).id))?.readAt).toBeUndefined()
  })

  it("orders unread high and critical first, then newest first", () => {
    const row = (
      id: string,
      priority: NotifyInput["priority"],
      createdAt: number,
      readAt?: number
    ) => ({
      id,
      key: id,
      category: "messages" as const,
      priority,
      title: id,
      body: "",
      createdAt,
      ...(readAt ? { readAt } : {}),
    })
    const ordered = orderNotifications([
      row("old-normal", "normal", 1),
      row("new-normal", "normal", 5),
      row("high", "high", 2),
      row("critical", "critical", 3),
      row("read-critical", "critical", 4, 9),
    ])
    expect(ordered.map((r) => r.id)).toEqual([
      "critical",
      "high",
      "new-normal",
      "read-critical",
      "old-normal",
    ])
  })

  it("summarizes the unread count and whether anything urgent is unread", () => {
    const base = {
      key: "",
      category: "system" as const,
      title: "",
      body: "",
      createdAt: 1,
    }
    expect(summarize([])).toEqual({ unread: 0, urgent: false })
    expect(
      summarize([
        { ...base, id: "a", priority: "normal" },
        { ...base, id: "b", priority: "high", readAt: 2 },
        { ...base, id: "c", priority: "low", dismissedAt: 2 },
      ])
    ).toEqual({ unread: 1, urgent: false })
    expect(summarize([{ ...base, id: "d", priority: "critical" }])).toEqual({
      unread: 1,
      urgent: true,
    })
  })

  it("prunes old read items, anything past 30 days, and keeps at most 200", async () => {
    const db = createTestDb()
    const now = 100 * DAY
    const fresh = await notify(db, input({ key: "fresh" }), {
      now: now - DAY,
      ids,
    })
    const oldRead = await notify(db, input({ key: "old-read" }), {
      now: now - 8 * DAY,
      ids,
    })
    await markRead(db, [must(oldRead).id], now - 8 * DAY)
    await notify(db, input({ key: "old-unread" }), { now: now - 8 * DAY, ids })
    await notify(db, input({ key: "ancient" }), { now: now - 31 * DAY, ids })
    await prune(db, now)
    expect((await db.notifications.toArray()).map((r) => r.key).sort()).toEqual(
      ["fresh", "old-unread"]
    )
    await db.notifications.bulkPut(
      Array.from({ length: 205 }, (_, i) => ({
        ...must(fresh),
        id: `bulk-${i}`,
        key: `bulk-${i}`,
        createdAt: now - i,
      }))
    )
    await prune(db, now)
    expect(await db.notifications.count()).toBe(200)
  })
})
