import { describe, expect, it } from "vitest"
import { fileURLToPath } from "node:url"
import { loadGameTerms, splitWords } from "../../eslint-rules/no-game-terms.js"

describe("no-game-terms matcher", () => {
  it("splits identifiers into whole words", () => {
    expect(splitWords("fuelCount")).toEqual(["fuel", "count"])
    expect(splitWords("AUTO_HUB_score")).toEqual(["auto", "hub", "score"])
    expect(splitWords("network")).toEqual(["network"])
    expect(splitWords("personal notes")).toEqual(["personal", "notes"])
  })

  it("loads every game's terms plus the historical list", () => {
    const terms = loadGameTerms(
      fileURLToPath(new URL("../../src/games", import.meta.url))
    )
    expect(terms.has("fuel")).toBe(true)
    expect(terms.has("coral")).toBe(true)
    // plain-English words the app needs stay allowed
    expect(terms.has("note")).toBe(false)
    expect(terms.has("stage")).toBe(false)
  })
})
