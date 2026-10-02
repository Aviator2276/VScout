import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { compare as scriptCompare } from "../../../scripts/bump-version.mjs"
import { compareSemver, isBelowMinimum, parseSemver } from "../semver"

describe("compareSemver", () => {
  it.each([
    ["2.0.0-alpha.0", "2.0.0-alpha.1", -1],
    ["2.0.0-alpha.9", "2.0.0-alpha.10", -1],
    ["2.0.0-alpha.3", "2.0.0-beta.0", -1],
    ["2.0.0-rc.1", "2.0.0", -1],
    ["2.0.0", "2.0.1", -1],
    ["2.1.0", "2.0.9", 1],
    ["2.0.0+build.5", "2.0.0", 0],
    ["1.0.0-alpha", "1.0.0-alpha.1", -1],
  ])("%s vs %s → %i", (a, b, expected) => {
    expect(compareSemver(a, b)).toBe(expected)
    expect(compareSemver(b, a)).toBe(-expected || 0)
  })

  it("rejects non-semver input", () => {
    expect(parseSemver("2.0")).toBeNull()
    expect(() => compareSemver("v2.0.0", "2.0.0")).toThrow()
  })

  it("isBelowMinimum uses precedence, not string order", () => {
    expect(isBelowMinimum("2.0.0-beta.1", "2.0.0")).toBe(true)
    expect(isBelowMinimum("2.10.0", "2.9.0")).toBe(false)
  })

  it("matches scripts/bump-version.mjs on random versions", () => {
    const id = fc.oneof(
      fc.nat({ max: 20 }).map(String),
      fc.constantFrom("alpha", "beta", "rc")
    )
    const version = fc
      .tuple(
        fc.nat({ max: 3 }),
        fc.nat({ max: 3 }),
        fc.nat({ max: 3 }),
        fc.array(id, { maxLength: 2 })
      )
      .map(
        ([a, b, c, pre]) =>
          `${a}.${b}.${c}${pre.length ? `-${pre.join(".")}` : ""}`
      )
    fc.assert(
      fc.property(version, version, (a, b) => {
        expect(compareSemver(a, b)).toBe(scriptCompare(a, b))
      })
    )
  })
})
