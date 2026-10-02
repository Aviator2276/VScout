import { describe, expect, it } from "vitest"
import type {
  FieldDef,
  FormDef,
  MetricInput,
  ScoutEntryView,
  ScoringKeys,
} from "../../types"
import { consolidate } from "../consolidate"
import { mapEnum, perRobotValue } from "../external"
import { appliesTo, isRequired, isVisible } from "../fields"
import { confidenceFrom, meanRating, rateWhere } from "../metrics"
import { deriveFormSchema, fieldSchema } from "../schema"
import { cv, median, stdev } from "../stats"
import { game } from "../../__fixtures__/test-game/definition"

const view = (
  data: Record<string, unknown>,
  disagreements: Array<string> = []
): ScoutEntryView => ({
  matchKey: "m",
  data,
  scouterCount: 2,
  disagreements,
})
const input = (entries: Array<ScoutEntryView>): MetricInput => ({
  teamNumber: 1,
  window: "all",
  matches: [],
  entries,
  allianceRanks: [],
  pit: null,
  post: [],
  external: null,
  weights: {},
})

describe("metric helpers", () => {
  it("confidence grows with sample size and drops with disagreement", () => {
    expect(confidenceFrom(2)).toBe("low")
    expect(confidenceFrom(5)).toBe("medium")
    expect(confidenceFrom(5, 6)).toBe("low")
    expect(confidenceFrom(9)).toBe("high")
    expect(confidenceFrom(9, 10)).toBe("medium")
  })

  it("meanRating skips unanswered entries and counts disagreements", () => {
    const r = meanRating("r")(
      input([view({ r: 2 }, ["r"]), view({ r: 4 }), view({ r: null })])
    )
    expect(r).toMatchObject({ value: 3, sampleSize: 2, confidence: "low" })
    expect(meanRating("r")(input([view({ r: 2 })])).value).toBeNull()
  })

  it("rateWhere is null without entries", () => {
    expect(rateWhere(() => true, [])).toBeNull()
    expect(rateWhere((d) => d.a === 1, [view({ a: 1 }), view({ a: 2 })])).toBe(
      0.5
    )
  })
})

describe("consolidate per kind", () => {
  const form: FormDef = {
    id: "match",
    sections: [
      {
        id: "s",
        title: "s",
        fields: [
          { kind: "count", id: "c", label: "c", min: 0, max: 9 },
          {
            kind: "multiChoice",
            id: "m",
            label: "m",
            options: [
              { value: "a", label: "a" },
              { value: "b", label: "b" },
            ],
          },
          {
            kind: "fieldPosition",
            id: "z",
            label: "z",
            image: "f",
            mode: "zone",
            mirrorForAlliance: false,
          },
          {
            kind: "text",
            id: "t",
            label: "t",
            multiline: false,
            maxLength: 10,
          },
        ] satisfies Array<FieldDef>,
      },
    ],
  }

  it("averages counts, keeps majority options, and keeps explicit nulls", () => {
    const v = consolidate(form, "m1", [
      { data: { c: 2, m: ["a", "b"], z: null, t: null } },
      { data: { c: 4, m: ["a"], z: null } },
      { data: { c: 6, m: ["a"] } },
    ])
    expect(v.data).toEqual({ c: 4, m: ["a"], z: null, t: null })
  })
})

describe("external edge cases", () => {
  const keys: ScoringKeys = {
    tba: { alliance: {}, perRobot: { raw: { path: "score{n}" } } },
    statbotics: { teamEvent: {}, match: {} },
    enumMaps: { m: { Yes: "yes", Gone: null } },
    units: {},
  }
  it("handles non-strings, missing maps, null mappings and unmapped paths", () => {
    expect(mapEnum(keys, "m", 3)).toEqual({ value: "unknown", known: false })
    expect(mapEnum(keys, "missing", "Yes")).toEqual({
      value: "unknown",
      known: false,
    })
    expect(mapEnum(keys, "m", "Gone")).toEqual({ value: null, known: true })
    expect(perRobotValue(keys, "raw", { score1: 12 }, 1)).toEqual({
      value: "12",
      known: true,
    })
    expect(perRobotValue(keys, "raw", {}, 1)).toEqual({
      value: null,
      known: true,
    })
  })
})

describe("field helpers and schemas", () => {
  it("applies modes, stages and required rules", () => {
    const f: FieldDef = {
      kind: "boolean",
      id: "b",
      label: "b",
      stages: ["playoff"],
      required: true,
    }
    expect(appliesTo(f, { level: "new", stage: "qual" })).toBe(false)
    expect(appliesTo(f, { level: "new", stage: "playoff" })).toBe(true)
    expect(isRequired(f, "experienced")).toBe(true)
    expect(isRequired({ ...f, required: false }, "new")).toBe(false)
    expect(isVisible(f, {})).toBe(true)
  })

  it("bounds numbers and accepts points for free positions", () => {
    const num = fieldSchema(
      { kind: "number", id: "n", label: "n", min: 1, max: 5, integer: true },
      game,
      "new"
    )
    expect(num.safeParse(6).success).toBe(false)
    expect(num.safeParse(2.5).success).toBe(false)
    expect(num.safeParse(null).success).toBe(true)
    const point = fieldSchema(
      {
        kind: "fieldPosition",
        id: "p",
        label: "p",
        image: "f",
        mode: "point",
        mirrorForAlliance: true,
      },
      game,
      "new"
    )
    expect(point.safeParse({ x: 0.5, y: 1 }).success).toBe(true)
    expect(point.safeParse({ x: 2, y: 0 }).success).toBe(false)
    const unbounded = fieldSchema(
      { kind: "number", id: "u", label: "u" },
      game,
      "new"
    )
    expect(unbounded.safeParse(-3.5).success).toBe(true)
  })

  it("treats an empty multi-choice as missing for required fields", () => {
    const form: FormDef = {
      id: "pit",
      sections: [
        {
          id: "s",
          title: "s",
          fields: [
            {
              kind: "multiChoice",
              id: "m",
              label: "m",
              required: true,
              options: [{ value: "a", label: "a" }],
            },
          ],
        },
      ],
    }
    const schema = deriveFormSchema({ ...game, id: "2098-edge" }, form, {
      level: "new",
      stage: "qual",
    })
    expect(schema.safeParse({ m: [] }).success).toBe(false)
    expect(schema.safeParse({ m: ["a"] }).success).toBe(true)
  })
})

describe("stats edge cases", () => {
  it("median, stdev and cv on empty and non-zero input", () => {
    expect(median([])).toBeNull()
    expect(stdev([])).toBeNull()
    expect(cv([2, 4])).toBeCloseTo(1 / 3)
  })
})
