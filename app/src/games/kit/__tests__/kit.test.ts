import { describe, expect, it } from "vitest"
import { game } from "../../__fixtures__/test-game/definition"
import { consolidate } from "../consolidate"
import { mapEnum, perRobotValue, readPath } from "../external"
import { evaluate } from "../fields"
import { t } from "../labels"
import { runMigrations } from "../migrate"
import { cv, mean, median, stdev, windowed } from "../stats"

describe("conditions", () => {
  it("evaluates eq, in, truthy, all and any", () => {
    const d = { a: 1, b: "x", c: true }
    expect(evaluate({ field: "a", eq: 1 }, d)).toBe(true)
    expect(evaluate({ field: "b", in: ["y", "x"] }, d)).toBe(true)
    expect(evaluate({ field: "missing", truthy: true }, d)).toBe(false)
    expect(
      evaluate(
        {
          all: [
            { field: "a", eq: 1 },
            { field: "c", truthy: true },
          ],
        },
        d
      )
    ).toBe(true)
    expect(
      evaluate(
        {
          any: [
            { field: "a", eq: 2 },
            { field: "b", eq: "z" },
          ],
        },
        d
      )
    ).toBe(false)
  })
})

describe("migrations", () => {
  it("runs the chain, keeps current data, and flags newer versions", () => {
    expect(runMigrations(game, { "teleop.job": "defense" }, 1)).toEqual({
      status: "migrated",
      data: { "teleop.role": "defense" },
      schemaVersion: 2,
    })
    expect(runMigrations(game, { a: 1 }, 2).status).toBe("current")
    expect(runMigrations(game, { a: 1 }, 3).status).toBe("unsupported")
    expect(() =>
      runMigrations({ schemaVersion: 3, migrations: {} }, {}, 1)
    ).toThrow("Missing migration 1 → 2")
  })
})

describe("stats", () => {
  it("handles empty and small inputs", () => {
    expect(mean([])).toBeNull()
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2)
    expect(cv([0, 0])).toBeNull()
    expect(windowed([1, 2, 3, 4, 5, 6], "last4")).toEqual([3, 4, 5, 6])
  })
})

describe("consolidate", () => {
  it("merges several scouters per field kind and records disagreements", () => {
    const view = consolidate(game.matchForm, "m1", [
      {
        data: {
          "pre.noShow": false,
          "teleop.role": "offense",
          "teleop.widgetRating": 4,
          "post.notes": "",
          incidents: [],
        },
      },
      {
        data: {
          "pre.noShow": false,
          "teleop.role": "offense",
          "teleop.widgetRating": 2,
          "post.notes": "fast",
          incidents: [{ id: "1" }],
        },
      },
      {
        data: {
          "pre.noShow": false,
          "teleop.role": "defense",
          "teleop.widgetRating": 3,
        },
      },
    ])
    expect(view.data).toMatchObject({
      "pre.noShow": false,
      "teleop.role": "offense",
      "teleop.widgetRating": 3,
      "post.notes": "fast",
      incidents: [{ id: "1" }],
    })
    expect(view.scouterCount).toBe(3)
    expect(view.disagreements).toEqual(
      expect.arrayContaining(["teleop.role", "teleop.widgetRating"])
    )
    expect(view.disagreements).not.toContain("pre.noShow")
  })
})

describe("external data", () => {
  it("reads paths and maps enums; unknown strings become 'unknown', never a real option", () => {
    expect(readPath({ a: { b: 3 } }, "a.b")).toBe(3)
    expect(readPath({ a: 1 }, "a.b")).toBeUndefined()
    expect(mapEnum(game.scoringKeys, "park", "Parked")).toEqual({
      value: "yes",
      known: true,
    })
    expect(mapEnum(game.scoringKeys, "park", "Hovering")).toEqual({
      value: "unknown",
      known: false,
    })
    expect(
      perRobotValue(game.scoringKeys, "parked", { parkRobot2: "None" }, 2)
    ).toEqual({ value: "no", known: true })
    expect(perRobotValue(game.scoringKeys, "nope", {}, 1)).toBeUndefined()
  })
})

describe("labels", () => {
  it("falls back to the key so a missing label is visible", () => {
    expect(t(game, "phase.auto")).toBe("Auto")
    expect(t(game, "no.such.key")).toBe("no.such.key")
  })
})
