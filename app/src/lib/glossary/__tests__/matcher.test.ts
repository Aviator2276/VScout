import { describe, expect, it } from "vitest"
import type { GlossaryTerm } from "@/types/glossary"
import { createMatcher, firstPerParagraph, mergeTerms } from "../matcher"

const term = (id: string, extra: Partial<GlossaryTerm> = {}): GlossaryTerm => ({
  id,
  term: id,
  short: `${id} means something`,
  category: "match",
  source: "core",
  ...extra,
})

const terms = [
  term("bump"),
  term("disabled", { aliases: ["disable", "disables"] }),
  term("defense"),
  term("defense-bot", { term: "defense bot" }),
  term("epa", { term: "EPA", caseSensitive: true }),
]

describe("glossary matcher (glossary-help.md §6–7)", () => {
  const m = createMatcher(terms)

  it("links terms and keeps the rest as plain text", () => {
    expect(m.segment("They hit the bump and were disabled")).toEqual([
      "They hit the ",
      { termId: "bump", text: "bump" },
      " and were ",
      { termId: "disabled", text: "disabled" },
    ])
  })

  it("never matches inside a longer word", () => {
    expect(m.segment("bumper fell off")).toEqual(["bumper fell off"])
  })

  it("prefers the longest term", () => {
    expect(m.segment("a defense bot")).toEqual([
      "a ",
      { termId: "defense-bot", text: "defense bot" },
    ])
  })

  it("is case-insensitive except for case-sensitive terms", () => {
    expect(m.segment("Bump")).toEqual([{ termId: "bump", text: "Bump" }])
    expect(m.segment("high EPA")).toEqual([
      "high ",
      { termId: "epa", text: "EPA" },
    ])
    expect(m.segment("epa")).toEqual(["epa"])
  })

  it("matches aliases and special characters safely", () => {
    const x = createMatcher([term("c++", { term: "C++" }), ...terms])
    expect(m.segment("it disables")).toEqual([
      "it ",
      { termId: "disabled", text: "disables" },
    ])
    expect(x.segment("in C++ code")).toEqual([
      "in ",
      { termId: "c++", text: "C++" },
      " code",
    ])
  })

  it("returns the cached result for repeated text", () => {
    expect(m.segment("bump")).toBe(m.segment("bump"))
  })

  it("first per paragraph keeps only the first occurrence", () => {
    expect(firstPerParagraph(m.segment("bump, bump"))).toEqual([
      { termId: "bump", text: "bump" },
      ", ",
      "bump",
    ])
  })

  it("no terms: plain text", () => {
    expect(createMatcher([]).segment("bump")).toEqual(["bump"])
  })

  it("later sources override earlier ones by id", () => {
    const merged = mergeTerms([term("bump")], [term("bump", { short: "game" })])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.short).toBe("game")
  })

  it("segments 200 comments of 300 chars quickly", () => {
    const fresh = createMatcher(terms)
    const texts = Array.from({ length: 200 }, (_, i) =>
      `${i} they played defense and hit the bump `.repeat(8)
    )
    const t0 = performance.now()
    for (const s of texts) fresh.segment(s)
    expect(performance.now() - t0).toBeLessThan(100)
  })
})
