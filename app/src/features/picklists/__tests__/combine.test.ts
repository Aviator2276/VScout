import { describe, expect, it } from "vitest"
import { combineLists, compareDeltas } from "../utils/combine"
import { keyForMove, keysAfter } from "../utils/ranks"

const list = (
  owner: string,
  teams: Array<number>,
  purpose = "first",
  followed = false
) => ({
  id: owner,
  owner,
  purpose,
  teams,
  followed,
})

describe("combineLists (scout-tab.md P3)", () => {
  const lists = [
    list("Alex", [254, 1678, 971]),
    list("Sam", [1678, 254, 118]),
    list("Kim", [254, 118]),
  ]

  it("average rank: mean position, spread and list count", () => {
    const rows = combineLists(lists, "average-rank")
    expect(
      rows.map((r) => [r.teamNumber, r.meanRank, r.min, r.max, r.count])
    ).toEqual([
      [254, 1.33, 1, 2, 3],
      [1678, 1.5, 1, 2, 2],
      [118, 2.5, 2, 3, 2],
      [971, 3, 3, 3, 1],
    ])
  })

  it("Borda: n − p + 1 points per list", () => {
    const rows = combineLists(lists, "borda")
    // 254: 3 + 2 + 2 = 7; 1678: 2 + 3 = 5; 118: 1 + 1 = 2; 971: 1
    expect(rows.map((r) => [r.teamNumber, r.score])).toEqual([
      [254, 7],
      [1678, 5],
      [118, 2],
      [971, 1],
    ])
  })

  it("DNP lists flag teams without ranking them; the followed list can count double", () => {
    const rows = combineLists(
      [
        list("Alex", [971, 254]),
        list("Sam", [254, 971], "first", true),
        list("Kim", [971], "dnp"),
      ],
      "average-rank",
      { weightFollowed: true }
    )
    expect(rows[0]).toMatchObject({ teamNumber: 254, meanRank: 1.33 })
    expect(rows.find((r) => r.teamNumber === 971)?.dnp).toBe(1)
  })

  it("compare deltas", () => {
    expect([...compareDeltas([1, 2, 3], [2, 1])]).toEqual([
      [1, 1],
      [2, -1],
      [3, null],
    ])
  })
})

describe("rank keys", () => {
  it("appends in order and moves between neighbours", () => {
    const keys = keysAfter(null, 3)
    expect([...keys].sort()).toEqual(keys)
    const moved = keyForMove(keys, 2, 0)
    expect(moved < (keys[0] ?? "")).toBe(true)
    const mid = keyForMove(keys, 0, 1)
    expect(mid > (keys[1] ?? "") && mid < (keys[2] ?? "")).toBe(true)
  })
})
