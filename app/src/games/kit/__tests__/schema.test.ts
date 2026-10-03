import { describe, expect, it } from "vitest"
import { game } from "../../__fixtures__/test-game/definition"
import { deriveFormSchema, draftSchema } from "../schema"

const newQual = { level: "new", stage: "qual" } as const
const expQual = { level: "experienced", stage: "qual" } as const

describe("deriveFormSchema", () => {
  const schema = deriveFormSchema(game, game.matchForm, newQual)

  it("accepts a complete entry", () => {
    expect(
      schema.safeParse({
        "pre.noShow": false,
        "auto.effectiveness": 4,
        "teleop.role": "offense",
        "teleop.widgetRating": 3,
        incidents: [],
      }).success
    ).toBe(true)
  })

  it("requires fields marked required for the level", () => {
    const r = schema.safeParse({ "pre.noShow": false })
    expect(r.success).toBe(false)
    expect(r.error?.issues.map((i) => i.path.join("."))).toContain(
      "auto.effectiveness"
    )
    expect(
      deriveFormSchema(game, game.matchForm, expQual).safeParse({
        "pre.noShow": false,
      }).success
    ).toBe(true)
  })

  it("rejects values in hidden fields", () => {
    const r = schema.safeParse({ "pre.noShow": true, "auto.effectiveness": 4 })
    expect(r.error?.issues[0]?.message).toBe("Hidden field must be empty")
  })

  it("rejects unknown keys and fields of another level", () => {
    expect(schema.safeParse({ "pre.noShow": true, extra: 1 }).success).toBe(
      false
    )
    // teleop.gizmos is experienced-only
    const gizmos = {
      "pre.noShow": false,
      "auto.effectiveness": 3,
      "teleop.gizmos": 2,
    }
    expect(schema.safeParse(gizmos).success).toBe(false)
    expect(
      deriveFormSchema(game, game.matchForm, expQual).safeParse(gizmos).success
    ).toBe(true)
  })

  it("requires incident type and length for new scouters only", () => {
    const incident = {
      id: "i1",
      phase: "auto",
      type: null,
      category: null,
      length: null,
      resolution: null,
      resolutionNote: null,
      note: null,
    }
    const data = {
      "pre.noShow": false,
      "auto.effectiveness": 3,
      incidents: [incident],
    }
    expect(schema.safeParse(data).success).toBe(false)
    expect(
      deriveFormSchema(game, game.matchForm, expQual).safeParse(data).success
    ).toBe(true)
  })

  it("is memoized per game, version, form, level and stage", () => {
    expect(deriveFormSchema(game, game.matchForm, newQual)).toBe(schema)
  })

  it("drafts never block on required or hidden fields", () => {
    expect(
      draftSchema(game, game.matchForm, newQual).safeParse({
        "pre.noShow": true,
        "auto.effectiveness": 2,
      }).success
    ).toBe(true)
  })
})
