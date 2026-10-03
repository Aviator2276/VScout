import { describe, expect, it } from "vitest"
import {
  applyAction,
  availableTeams,
  initialBoard,
  nextPicker,
  pickableFor,
  replay,
} from "../utils/selection-rules"

// teams ranked 1..12 are 101..112
const ranked = Array.from({ length: 12 }, (_, i) => 101 + i)

describe("alliance selection rules (round-1 criteria 10–11)", () => {
  it("captains come from the rankings and picking is serpentine", () => {
    let b = initialBoard(ranked)
    expect(b.alliances.map((a) => a.captain)).toEqual([
      101, 102, 103, 104, 105, 106, 107, 108,
    ])
    expect(nextPicker(b)).toEqual({ seed: 1, round: 1 })
    // round 1 for seeds 1..8, then round 2 runs 8..1 (serpentine)
    const field = Array.from({ length: 30 }, (_, k) => 101 + k)
    b = initialBoard(field)
    const order: Array<number> = []
    for (;;) {
      const turn = nextPicker(b)
      if (!turn) break
      order.push(turn.seed)
      const team = availableTeams(b, field)[0] ?? 0
      const r = applyAction(b, { kind: "pick", seed: turn.seed, team }, field)
      if (!r.ok) throw new Error(r.error)
      b = r.board
    }
    expect(order).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8, 7, 6, 5, 4, 3, 2, 1])
    expect(b.alliances.every((a) => a.picks.length === 2)).toBe(true)
  })

  it("picking a lower seed's captain moves everyone below up and refills seed 8", () => {
    const b = initialBoard(ranked)
    const r = applyAction(b, { kind: "pick", seed: 1, team: 104 }, ranked)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.board.alliances.map((a) => a.captain)).toEqual([
      101, 102, 103, 105, 106, 107, 108, 109,
    ])
    expect(r.board.alliances[0]?.picks).toEqual([104])
  })

  it("a declined team can't be picked; a placed team can't be picked twice", () => {
    let b = initialBoard(ranked)
    const d = applyAction(b, { kind: "decline", team: 110 }, ranked)
    if (!d.ok) throw new Error()
    b = d.board
    expect(
      applyAction(b, { kind: "pick", seed: 1, team: 110 }, ranked)
    ).toEqual({ ok: false, error: "declined" })
    const p = applyAction(b, { kind: "pick", seed: 1, team: 111 }, ranked)
    if (!p.ok) throw new Error()
    expect(
      applyAction(p.board, { kind: "pick", seed: 2, team: 111 }, ranked)
    ).toEqual({ ok: false, error: "already-placed" })
    expect(availableTeams(p.board, ranked)).toEqual([109, 112])
  })

  it("an alliance may pick the captain of a lower seed, not a higher one", () => {
    const b = initialBoard(ranked)
    const forSeed3 = pickableFor(b, 3, ranked)
    expect(forSeed3).toContain(104)
    expect(forSeed3).not.toContain(102)
    expect(forSeed3).toContain(109)
  })

  it("undo is a replay without the action", () => {
    const actions = [
      { kind: "pick", seed: 1, team: 110 },
      { kind: "pick", seed: 2, team: 111 },
    ] as const
    const b = replay(ranked, [actions[1]])
    expect(b.alliances[0]?.picks).toEqual([])
    expect(b.alliances[1]?.picks).toEqual([111])
  })
})
