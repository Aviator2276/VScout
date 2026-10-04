import { describe, expect, it } from "vitest"
import { rankedChoice } from "../utils/ranked-choice"

const b = (voter: string, ...teams: Array<number>) => ({ voter, teams })

describe("rankedChoice", () => {
  it("a majority of first choices wins in round 1", () => {
    const rows = rankedChoice([
      b("a", 254, 1678),
      b("b", 254, 118),
      b("c", 1678, 254),
    ])
    expect(rows[0]).toMatchObject({
      teamNumber: 254,
      position: 1,
      round: 1,
      votes: 2,
      of: 3,
      firstChoices: 2,
      ballots: 3,
    })
    expect(rows[0]?.positions).toEqual([
      { voter: "a", position: 1 },
      { voter: "b", position: 1 },
      { voter: "c", position: 2 },
    ])
  })

  it("drops the weakest and moves its ballots to their next choice", () => {
    // first choices: 1:2, 2:2, 3:1 → 3 is dropped, its ballot goes to 2 → 2 wins 3 of 5
    const rows = rankedChoice([
      b("a", 1, 2),
      b("b", 1, 3),
      b("c", 2, 1),
      b("d", 2, 3),
      b("e", 3, 2),
    ])
    expect(rows[0]).toMatchObject({ teamNumber: 2, round: 2, votes: 3, of: 5 })
    // with 2 set aside: 1 has a, b, c → majority straight away
    expect(rows[1]).toMatchObject({ teamNumber: 1, round: 1, votes: 3 })
    expect(rows.map((r) => r.teamNumber)).toEqual([2, 1, 3])
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3])
  })

  it("an instant-runoff winner can beat the most first choices", () => {
    const rows = rankedChoice([
      b("a", 10, 30),
      b("b", 10, 30),
      b("c", 20, 30),
      b("d", 20, 30),
      b("e", 30, 20),
    ])
    // round 1: 10:2 20:2 30:1 → 30 dropped → e goes to 20 → 20 wins 3 of 5
    expect(rows[0]).toMatchObject({ teamNumber: 20, round: 2 })
  })

  it("ties for the fewest drop the lower Borda score, then fewer firsts, then the higher number", () => {
    // 5 and 6 tie on first choices; 5 is ranked second elsewhere so 6 drops
    const rows = rankedChoice([b("a", 5), b("b", 6), b("c", 7, 5)])
    expect(rows[0]?.teamNumber).toBe(5)
    // full symmetry: the higher team number drops, so the lower wins
    expect(rankedChoice([b("a", 9), b("b", 8)])[0]?.teamNumber).toBe(8)
    expect(rankedChoice([b("a", 8), b("b", 9)])[0]?.teamNumber).toBe(8)
  })

  it("exhausted ballots stop counting and every team is ranked", () => {
    const rows = rankedChoice([b("a", 1), b("b", 2, 3), b("c", 2)])
    expect(rows.map((r) => r.teamNumber)).toEqual([2, 1, 3])
    // with 2 and 1 gone only b still counts, for 3
    expect(rows[2]).toMatchObject({ teamNumber: 3, votes: 1, of: 1 })
  })

  it("flags do-not-pick without changing the order, and ignores repeats", () => {
    const rows = rankedChoice(
      [b("a", 4, 4, 5), b("b", 4, 5)],
      new Map([[4, 2]])
    )
    expect(rows.map((r) => [r.teamNumber, r.dnp])).toEqual([
      [4, 2],
      [5, 0],
    ])
    expect(rows[1]?.positions).toEqual([
      { voter: "a", position: 2 },
      { voter: "b", position: 2 },
    ])
  })

  it("no ballots, no rows", () => {
    expect(rankedChoice([])).toEqual([])
    expect(rankedChoice([b("a")])).toEqual([])
  })
})
