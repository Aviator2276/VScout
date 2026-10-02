import { HttpResponse, http } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { API, setupEngine } from "@/testing/engine"
import { change } from "@/testing/changes"
import { testDeps } from "@/testing/db"
import {
  wireAllianceBoard,
  wireComment,
  wireEnvelope,
} from "@/testing/factories/wire"
import { MOCK_USER_ID, mockBackend } from "@/testing/mocks/mock-backend"
import { server } from "@/testing/mocks/server"
import { applyChanges } from "../apply-envelope"
import { deleteRecord } from "../mutate"
import { restoreRecord, sendBoardAction } from "../live-actions"
import type { LiveDeps } from "../live-actions"

beforeEach(() => mockBackend.reset())

function seedBoard() {
  const board = wireAllianceBoard({
    status: "inProgress",
    alliances: Array.from({ length: 8 }, (_, i) => ({
      seed: i + 1,
      captain: 100 + i,
      picks: [],
    })),
  })
  mockBackend.records.set(`allianceBoard:${board.eventKey}`, {
    ...board,
    history: [],
  })
  mockBackend.append(
    "event:2026casj",
    "allianceBoard",
    wireEnvelope("allianceBoard", board)
  )
  return board
}

describe.each(["http", "mqtt"] as const)(
  "live alliance board actions over %s (ADR-032/064)",
  (transport) => {
    function deps(t: ReturnType<typeof setupEngine>): LiveDeps {
      return {
        api: t.api,
        db: t.db,
        games: () => null,
        now: t.clock.now,
        newId: () => crypto.randomUUID(),
      }
    }

    it("records a pick and stores the returned board", async () => {
      const board = seedBoard()
      const t = setupEngine({ transport })
      const r = await sendBoardAction(deps(t), "2026casj", board.rev, {
        kind: "pick",
        seed: 1,
        team: 254,
      })
      expect(r).toMatchObject({ kind: "ok" })
      const local = await t.db.allianceBoards.get("2026casj")
      expect(local?.alliances[0]?.picks).toEqual([254])
      expect(local?.history.at(-1)).toMatchObject({
        actorId: MOCK_USER_ID,
        kind: "pick",
        team: 254,
      })
      expect(await t.db.outbox.count()).toBe(0)
    })

    it("the same pick recorded twice is 'already recorded', not an error (criterion 15)", async () => {
      const board = seedBoard()
      const t = setupEngine({ transport })
      await sendBoardAction(deps(t), "2026casj", board.rev, {
        kind: "pick",
        seed: 1,
        team: 254,
      })
      // a second scouter still holding the old rev
      const r = await sendBoardAction(deps(t), "2026casj", board.rev, {
        kind: "pick",
        seed: 1,
        team: 254,
      })
      expect(r).toMatchObject({ kind: "already", actorId: MOCK_USER_ID })
    })

    it("a different change in between is a conflict with the fresh board (criterion 16)", async () => {
      const board = seedBoard()
      const t = setupEngine({ transport })
      await sendBoardAction(deps(t), "2026casj", board.rev, {
        kind: "pick",
        seed: 1,
        team: 254,
      })
      const r = await sendBoardAction(deps(t), "2026casj", board.rev, {
        kind: "pick",
        seed: 1,
        team: 971,
      })
      expect(r.kind).toBe("conflict")
    })
  }
)

describe("live actions when offline (criterion 17a)", () => {
  it("both transports failing is 'offline' and nothing is queued", async () => {
    const board = seedBoard()
    server.use(http.all(`${API}/*`, () => HttpResponse.error()))
    const t = setupEngine({ transport: "http" })
    const r = await sendBoardAction(
      {
        api: t.api,
        db: t.db,
        games: () => null,
        now: t.clock.now,
        newId: () => "01900000-0000-7000-8000-00000000b001",
      },
      "2026casj",
      board.rev,
      { kind: "pick", seed: 1, team: 254 }
    )
    expect(r).toEqual({ kind: "offline" })
    expect(await t.db.outbox.count()).toBe(0)
  })

  it("a guest is refused", async () => {
    const board = seedBoard()
    mockBackend.role = "guest"
    const t = setupEngine({ transport: "http" })
    const r = await sendBoardAction(
      {
        api: t.api,
        db: t.db,
        games: () => null,
        now: t.clock.now,
        newId: () => "01900000-0000-7000-8000-00000000b002",
      },
      "2026casj",
      board.rev,
      { kind: "pick", seed: 1, team: 254 }
    )
    expect(r).toEqual({ kind: "forbidden" })
  })
})

describe("Recently Deleted → Restore (ADR-029)", () => {
  function deps(t: ReturnType<typeof setupEngine>): LiveDeps {
    return {
      api: t.api,
      db: t.db,
      games: () => null,
      now: t.clock.now,
      newId: () => crypto.randomUUID(),
    }
  }
  async function seedComment(t: ReturnType<typeof setupEngine>) {
    const c = wireComment({ rev: 1, authorId: MOCK_USER_ID, body: "keep me" })
    mockBackend.records.set(`comment:${c.id}`, c)
    await applyChanges([change("comment", c)], testDeps(t.db).applyCtx)
    return c
  }

  it("a delete that was never sent is simply taken back, with no request", async () => {
    const t = setupEngine()
    const c = await seedComment(t)
    await deleteRecord(t.mutateDeps, "comment", c.id)
    const r = await restoreRecord(deps(t), "comment", c.id)
    expect(r).toEqual({ kind: "ok" })
    expect(await t.db.comments.get(c.id)).toMatchObject({ body: "keep me" })
    expect(await t.db.outbox.count()).toBe(0)
    expect(mockBackend.applied).toBe(0)
  })

  it("a delete sent but not acknowledged must finish first", async () => {
    const t = setupEngine()
    const c = await seedComment(t)
    await deleteRecord(t.mutateDeps, "comment", c.id)
    await t.db.outbox.toCollection().modify({ state: "queued", baseRev: 1 })
    expect(await restoreRecord(deps(t), "comment", c.id)).toMatchObject({
      kind: "error",
      code: "delete_syncing",
    })
  })

  it("a confirmed delete is restored on the server with the tombstone's rev", async () => {
    const t = setupEngine()
    const c = await seedComment(t)
    await deleteRecord(t.mutateDeps, "comment", c.id)
    await t.engine.syncNow("write", { pushOnly: true })
    expect(await t.db.outbox.count()).toBe(0)
    expect(mockBackend.records.has(`comment:${c.id}`)).toBe(false)
    expect(await restoreRecord(deps(t), "comment", c.id)).toEqual({
      kind: "ok",
    })
    expect(mockBackend.records.get(`comment:${c.id}`)).toMatchObject({
      rev: 3,
      body: "keep me",
    })
    expect(await t.db.comments.get(c.id)).toMatchObject({ rev: 3 })
    expect(await t.db.tombstones.get(["comment", c.id])).toBeUndefined()
  })
})
