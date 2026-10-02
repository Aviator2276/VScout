import { afterEach, describe, expect, it, vi } from "vitest"
import { clearLogs, logger, recentLogs, setLogClock } from "@/lib/logger"
import { createTestDb } from "@/testing/db"
import { attachLogStore } from "../log-store"

afterEach(() => clearLogs())

describe("logger", () => {
  it("keeps the last 500 entries in memory", () => {
    setLogClock(() => 42)
    for (let i = 0; i < 510; i++) logger.info("test", `m${i}`)
    const logs = recentLogs()
    expect(logs).toHaveLength(500)
    expect(logs[0]).toMatchObject({ at: 42, message: "m10", level: "info" })
  })

  it("persists entries to Dexie in batches and never throws from the sink", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const db = createTestDb()
    const detach = attachLogStore(db, 10)
    logger.warn("sync", "conflict", { id: 1 })
    logger.error("api", "boom")
    await vi.advanceTimersByTimeAsync(20)
    await vi.waitFor(async () => expect(await db.logs.count()).toBe(2))
    await detach()
    vi.useRealTimers()
    expect((await db.logs.toArray()).map((l) => l.message)).toEqual([
      "conflict",
      "boom",
    ])
  })
})
