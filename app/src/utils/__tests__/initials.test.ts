import { describe, expect, it } from "vitest"
import { initials } from "../initials"

describe("initials (FX-5)", () => {
  it.each([
    ["Alex Rivera", "AR"],
    ["Mary Ann Smith", "MS"],
    ["  sam   chen ", "SC"],
    ["Alex", "A"],
    ["Ünal Öz", "ÜÖ"],
    ["", ""],
  ])("%j → %s", (name, expected) => {
    expect(initials(name)).toBe(expected)
  })
})
