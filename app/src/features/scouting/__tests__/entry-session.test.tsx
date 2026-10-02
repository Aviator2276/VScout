import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { game } from "@/games/__fixtures__/test-game/definition"
import { migrateDrafts } from "@/lib/db/drafts"
import { createTestRuntime } from "@/testing/data-runtime"
import { TEST_USER, testGames } from "@/testing/db"
import { toDomain } from "@/testing/factories/records"
import { TEST_EVENT, wireScoutEntry } from "@/testing/factories/wire"
import { useEntrySession } from "../api/use-entry-session"
import type { EntrySession, EntryTarget } from "../api/use-entry-session"

const MATCH = `${TEST_EVENT}_qm12`
const ctx = { level: "new", stage: "qual" } as const
const target: EntryTarget = {
  kind: "match",
  eventKey: TEST_EVENT,
  teamNumber: 1678,
  matchKey: MATCH,
  station: "red2",
  ctx,
  allowNew: true,
}

function open(
  t: ReturnType<typeof createTestRuntime>,
  o: Partial<EntryTarget> = {}
) {
  return renderHook(() => useEntrySession(game, { ...target, ...o }), {
    wrapper: t.wrapper,
  })
}

async function ready(result: { current: EntrySession }) {
  await vi.waitFor(() => expect(result.current.status).not.toBe("loading"))
  if (result.current.status !== "ready") throw new Error(result.current.status)
  return result.current
}

describe("useEntrySession (scouting-forms.md)", () => {
  it("submit is one transaction: record + create op, and the draft is gone (criterion 9)", async () => {
    const t = createTestRuntime()
    const { result } = open(t)
    const s = await ready(result)
    expect(s.mode).toBe("new")
    expect(await t.db.drafts.count()).toBe(1)
    await act(async () => {
      await s.submit({
        data: { "pre.noShow": true },
        tags: { "post.notes": ["fast"] },
      })
    })
    const [entry] = await t.db.scoutEntries.toArray()
    expect(entry).toMatchObject({
      id: s.recordId,
      matchKey: MATCH,
      teamNumber: 1678,
      station: "red2",
      scouterLevel: "new",
      syncState: "pending",
      tags: ["fast"],
    })
    expect(await t.db.outbox.toArray()).toMatchObject([
      { entity: "scoutEntry", kind: "create" },
    ])
    expect(await t.db.drafts.count()).toBe(0)
  })

  it("a failed submit keeps the draft and writes nothing (criterion 10)", async () => {
    const t = createTestRuntime()
    const { result } = open(t)
    const s = await ready(result)
    // an answer the schema rejects makes createRecord throw inside the transaction
    await expect(
      s.submit({ data: { "auto.effectiveness": 99 }, tags: {} })
    ).rejects.toThrow()
    expect(await t.db.scoutEntries.count()).toBe(0)
    expect(await t.db.outbox.count()).toBe(0)
    expect(await t.db.drafts.count()).toBe(1)
  })

  it("resumes my draft with its values and time (criterion 8)", async () => {
    const t = createTestRuntime()
    const first = open(t)
    const s = await ready(first.result)
    s.autosave(
      { data: { "pre.noShow": false, "auto.effectiveness": 4 }, tags: {} },
      "auto"
    )
    await vi.waitFor(async () =>
      expect((await t.db.drafts.toArray())[0]?.values).toMatchObject({
        data: { "auto.effectiveness": 4 },
      })
    )
    first.unmount()
    const second = open(t)
    const r = await ready(second.result)
    expect(r).toMatchObject({
      mode: "resume",
      recordId: s.recordId,
      stage: "auto",
      initial: { data: { "auto.effectiveness": 4 } },
    })
    expect(r.resumedAt).not.toBeNull()
  })

  it("opens my existing entry in edit mode; saving queues an update with baseRev (criteria 12, 14)", async () => {
    const t = createTestRuntime()
    const mine = toDomain(
      "scoutEntry",
      wireScoutEntry({
        authorId: TEST_USER,
        matchKey: MATCH,
        teamNumber: 1678,
        station: "red2",
        data: { "pre.noShow": true },
        rev: 3,
      })
    )
    await t.db.scoutEntries.put(mine)
    const { result } = open(t)
    const s = await ready(result)
    expect(s).toMatchObject({ mode: "edit", recordId: mine.id })
    await act(async () => {
      await s.submit({ data: { "pre.noShow": true }, tags: {} })
    })
    const [op] = await t.db.outbox.toArray()
    expect(op).toMatchObject({ kind: "update", recordId: mine.id })
    expect((await t.db.scoutEntries.get(mine.id))?.rev).toBe(3)
  })

  it("another scouter's entry doesn't stop me: a separate entry (criterion 13)", async () => {
    const t = createTestRuntime()
    await t.db.scoutEntries.put(
      toDomain(
        "scoutEntry",
        wireScoutEntry({
          authorId: "someone-else",
          matchKey: MATCH,
          teamNumber: 1678,
        })
      )
    )
    const { result } = open(t)
    expect((await ready(result)).mode).toBe("new")
  })

  it("scouting closed: no new form, but my entry still opens (criterion 18)", async () => {
    const t = createTestRuntime()
    const closed = open(t, { allowNew: false })
    await vi.waitFor(() => expect(closed.result.current.status).toBe("closed"))
    expect(await t.db.drafts.count()).toBe(0)
    await t.db.scoutEntries.put(
      toDomain(
        "scoutEntry",
        wireScoutEntry({
          authorId: TEST_USER,
          matchKey: MATCH,
          teamNumber: 1678,
        })
      )
    )
    const again = open(t, { allowNew: false })
    expect((await ready(again.result)).mode).toBe("edit")
  })

  it("a draft that no longer fits shows as corrupt and is kept until Start Over (criterion 23)", async () => {
    const t = createTestRuntime()
    await t.db.drafts.put({
      id: "d1",
      userId: TEST_USER,
      kind: "match",
      eventKey: TEST_EVENT,
      context: { matchKey: MATCH, teamNumber: 1678, station: "red2" },
      values: { data: { "auto.effectiveness": "not a number" }, tags: {} },
      gameId: game.id,
      schemaVersion: game.schemaVersion,
      createdAt: 1,
      updatedAt: 1,
    })
    const { result } = open(t)
    await vi.waitFor(() => expect(result.current.status).toBe("corrupt"))
    expect(await t.db.drafts.get("d1")).toBeDefined()
    if (result.current.status !== "corrupt") return
    const startOver = result.current.startOver
    await act(() => startOver())
    expect(await t.db.drafts.get("d1")).toBeUndefined()
    expect((await ready(result)).mode).toBe("new")
  })
})

describe("migrateDrafts (criterion 11)", () => {
  it("runs the module's migrations and flags a draft that still doesn't fit", async () => {
    const t = createTestRuntime()
    const base = {
      userId: TEST_USER,
      kind: "match" as const,
      eventKey: TEST_EVENT,
      context: { matchKey: MATCH, teamNumber: 1678 },
      gameId: game.id,
      schemaVersion: 1,
      createdAt: 1,
      updatedAt: 1,
    }
    await t.db.drafts.bulkPut([
      {
        ...base,
        id: "old",
        values: { data: { "teleop.job": "defense" }, tags: {} },
      },
      {
        ...base,
        id: "bad",
        values: { data: { "auto.effectiveness": "x" }, tags: {} },
      },
    ])
    expect(await migrateDrafts(t.db, testGames)).toEqual({
      migrated: 1,
      flagged: 1,
    })
    expect(await t.db.drafts.get("old")).toMatchObject({
      schemaVersion: 2,
      values: { data: { "teleop.role": "defense" } },
    })
    expect((await t.db.drafts.get("bad"))?.needsReview).toBe(true)
  })
})
