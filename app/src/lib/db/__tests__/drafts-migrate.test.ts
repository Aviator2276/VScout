// migrateDrafts edge cases (game-module §6); the happy path is in features/scouting entry-session.
import { describe, expect, it } from "vitest"
import { game } from "@/games/__fixtures__/test-game/definition"
import type { GameDefinition } from "@/games/types"
import { TEST_USER, createTestDb } from "@/testing/db"
import { TEST_EVENT } from "@/testing/factories/wire"
import { migrateDrafts } from "../drafts"
import type { DraftRow } from "../types"

function draft(id: string, o: Partial<DraftRow> = {}): DraftRow {
  return {
    id,
    userId: TEST_USER,
    kind: "match",
    eventKey: TEST_EVENT,
    context: { matchKey: `${TEST_EVENT}_qm1`, teamNumber: 254 },
    values: {},
    gameId: game.id,
    schemaVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    ...o,
  }
}

describe("migrateDrafts edge cases", () => {
  it("skips unknown games and drafts already on the current version", async () => {
    const db = createTestDb()
    await db.drafts.bulkPut([
      draft("unknown", { gameId: "1999-nothing" }),
      draft("current", { schemaVersion: game.schemaVersion }),
    ])
    const games = (id: string) => (id === game.id ? game : null)
    expect(await migrateDrafts(db, games)).toEqual({ migrated: 0, flagged: 0 })
    expect(await db.drafts.get("current")).toEqual(
      draft("current", { schemaVersion: game.schemaVersion })
    )
  })

  it("flags a draft whose migration throws, and keeps it", async () => {
    const db = createTestDb()
    const broken: GameDefinition = {
      ...game,
      schemaVersion: 2,
      migrations: {
        1: () => {
          throw new Error("bad step")
        },
      },
    }
    // a comment draft with no data is migrated against the match form
    await db.drafts.put(draft("c", { kind: "comment" }))
    expect(await migrateDrafts(db, () => broken)).toEqual({
      migrated: 0,
      flagged: 1,
    })
    expect(await db.drafts.get("c")).toMatchObject({
      needsReview: true,
      schemaVersion: 1,
    })
  })
})
