import { describe, expect, it } from "vitest"
import { homeLayoutSetting } from "../home-layout"

describe("homeLayout storage (home.md H6)", () => {
  it("migrates the round-2 shape (criterion 23)", () => {
    expect(
      homeLayoutSetting.parse({
        preset: "scouter",
        widgets: [{ id: "c1", type: "clock", size: "small" }],
      })
    ).toEqual({
      v: 2,
      active: { kind: "custom" },
      custom: { compact: [{ id: "c1", widget: "clock", w: 2, h: 2 }] },
    })
  })

  it("an empty legacy list keeps its preset as the template", () => {
    expect(
      homeLayoutSetting.parse({ preset: "pit", widgets: [] })
    ).toMatchObject({
      active: { kind: "template", templateId: "pit" },
    })
  })

  it("orders an x/y dev build by row then column", () => {
    const out = homeLayoutSetting.parse({
      widgets: [
        { id: "b", type: "clock", size: "small", x: 2, y: 0 },
        { id: "a", type: "clock", size: "small", x: 0, y: 0 },
      ],
    })
    expect(out.custom.compact?.map((i) => i.id)).toEqual(["a", "b"])
  })

  it("a newer version fails so the caller keeps the raw value", () => {
    expect(homeLayoutSetting.safeParse({ v: 3, anything: true }).success).toBe(
      false
    )
  })

  it("keeps unknown template ids and widget types (criteria 21, 24)", () => {
    const v = {
      v: 2,
      active: { kind: "template", templateId: "retired" },
      custom: { compact: [{ id: "x", widget: "futureThing", w: 3, h: 3 }] },
    }
    expect(homeLayoutSetting.parse(v)).toEqual(v)
  })
})
