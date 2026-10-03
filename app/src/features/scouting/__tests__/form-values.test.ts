import { describe, expect, it } from "vitest"
import { game } from "@/games/__fixtures__/test-game/definition"
import { parseNumberInput } from "../components/fields/number-field"
import {
  decodeValues,
  encodeValues,
  fromKey,
  pruneHidden,
  reviewIssues,
  sectionsWithIssues,
  toKey,
  withControlDefaults,
} from "../utils/form-values"

const form = game.matchForm
const newbie = { level: "new", stage: "qual" } as const
const pro = { level: "experienced", stage: "qual" } as const

describe("form keys", () => {
  it("round-trips dotted field ids through path-safe keys", () => {
    expect(toKey("auto.effectiveness")).toBe("auto/effectiveness")
    expect(fromKey("auto/effectiveness")).toBe("auto.effectiveness")
    const v = {
      data: { "pre.noShow": false },
      tags: { "post.notes": ["fast"] },
    }
    expect(decodeValues(encodeValues(v))).toEqual(v)
  })

  it("rejects ids that would break the form's paths", () => {
    expect(() => toKey("a/b")).toThrow()
    expect(() => toKey("a[0]")).toThrow()
  })
})

describe("withControlDefaults", () => {
  it("starts switches off and counters at their minimum, nothing else", () => {
    expect(withControlDefaults(form, {})).toEqual({
      "pre.noShow": false,
      "teleop.gizmos": 0,
    })
    expect(
      withControlDefaults(form, { "pre.noShow": true })["pre.noShow"]
    ).toBe(true)
  })
})

describe("pruneHidden", () => {
  it("drops hidden answers, chains of them, other levels' fields and unknown keys", () => {
    const data = {
      "pre.noShow": true,
      "teleop.role": "offense",
      "teleop.widgetRating": 4,
      "teleop.gizmos": 3,
      "auto.effectiveness": null,
      stray: 1,
    }
    // noShow hides role, which hides the widget rating; gizmos is experienced-only
    expect(pruneHidden(form, newbie, data)).toEqual({
      "pre.noShow": true,
      "auto.effectiveness": null,
    })
    expect(pruneHidden(form, pro, { ...data, "pre.noShow": false })).toEqual({
      "pre.noShow": false,
      "teleop.role": "offense",
      "teleop.widgetRating": 4,
      "teleop.gizmos": 3,
      "auto.effectiveness": null,
    })
  })
})

describe("reviewIssues", () => {
  it("lists missing required answers in form order with their section", () => {
    const issues = reviewIssues(game, form, newbie, { "pre.noShow": false })
    expect(issues).toEqual([
      { fieldId: "auto.effectiveness", sectionId: "auto", message: "Required" },
    ])
    expect(sectionsWithIssues(issues)).toEqual(new Set(["auto"]))
    // experienced scouters don't have to rate auto
    expect(reviewIssues(game, form, pro, { "pre.noShow": false })).toEqual([])
    // a no-show hides it
    expect(reviewIssues(game, form, newbie, { "pre.noShow": true })).toEqual([])
  })

  it("flags answers the schema rejects", () => {
    expect(
      reviewIssues(game, form, pro, {
        "pre.noShow": false,
        "teleop.role": "flying",
      })
    ).toEqual([
      {
        fieldId: "teleop.role",
        sectionId: "teleop",
        message: "Check this answer",
      },
    ])
  })
})

describe("parseNumberInput", () => {
  it("reads typed numbers, commas included, and empty as no answer", () => {
    expect(parseNumberInput("12.5", false)).toBe(12.5)
    expect(parseNumberInput("12,5", false)).toBe(12.5)
    expect(parseNumberInput("12.9", true)).toBe(12)
    expect(parseNumberInput("  ", false)).toBeNull()
    expect(parseNumberInput("abc", false)).toBeNull()
  })
})
