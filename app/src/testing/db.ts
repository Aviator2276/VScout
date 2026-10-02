// Database test helpers (data-layer §14.1): a fresh database per test, deterministic time and ids.
import { afterEach } from "vitest"
import { game as testGame } from "@/games/__fixtures__/test-game/definition"
import type { GameDefinition } from "@/games/types"
import { createDb } from "@/lib/db/db"
import type { VScoutDB } from "@/lib/db/schema"
import type { ApplyCtx } from "@/lib/sync/apply-envelope"
import type { MutateDeps } from "@/lib/sync/mutate"

let counter = 0
const open: Array<VScoutDB> = []

afterEach(async () => {
  while (open.length) {
    const db = open.pop()
    if (db) await db.delete()
  }
})

export function createTestDb(): VScoutDB {
  const db = createDb(`test-${++counter}`)
  open.push(db)
  return db
}

export interface FakeClock {
  now: () => number
  advance: (ms: number) => void
}

export function fakeClock(start = Date.UTC(2026, 2, 20, 15, 0)): FakeClock {
  let t = start
  return { now: () => t, advance: (ms) => (t += ms) }
}

/** Sortable UUIDv7-shaped ids from a counter. */
export function seqIds(prefix = "0190aaaa") {
  let n = 0
  return {
    newId: () => `${prefix}-0000-7000-8000-${String(++n).padStart(12, "0")}`,
  }
}

export const testGames = (gameId: string): GameDefinition | null =>
  gameId === testGame.id ? testGame : null

export const TEST_USER = "01900000-0000-7000-8000-000000009000"

export function testDeps(db: VScoutDB, overrides: Partial<MutateDeps> = {}) {
  const clock = fakeClock()
  const ids = seqIds()
  const deps: MutateDeps = {
    db,
    clock,
    ids,
    games: testGames,
    session: () => ({ userId: TEST_USER }),
    ...overrides,
  }
  const applyCtx: ApplyCtx = {
    db,
    games: testGames,
    now: clock.now,
    newId: ids.newId,
  }
  return { deps, applyCtx, clock, ids }
}
