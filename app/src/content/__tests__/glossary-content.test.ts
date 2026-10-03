// Content checks for the bundled glossary and guides (features/glossary-help.md §6): the core
// terms merged with the active season's, as the Help panel shows them.
import { describe, expect, it } from "vitest"
import { activeGame } from "@/config/game"
import { coreGlossary } from "@/content/glossary/core"
import { coreGuides } from "@/content/guides/guides"
import { mergeTerms } from "@/lib/glossary/matcher"

const terms = mergeTerms(coreGlossary, activeGame.glossary)
const guides = [...coreGuides, ...(activeGame.guides ?? [])]
const termIds = new Set(terms.map((t) => t.id))
const guideIds = new Set(guides.map((g) => g.id))

describe("glossary content", () => {
  it("keeps short definitions within 140 characters", () => {
    const long = terms.filter((t) => t.short.length > 140).map((t) => t.id)
    expect(long).toEqual([])
  })

  it("links only to terms and guides that exist", () => {
    const broken = terms.flatMap((t) => [
      ...(t.related ?? [])
        .filter((r) => !termIds.has(r))
        .map((r) => `${t.id} → ${r}`),
      ...(t.seeAlsoGuide && !guideIds.has(t.seeAlsoGuide)
        ? [`${t.id} → guide:${t.seeAlsoGuide}`]
        : []),
    ])
    expect(broken).toEqual([])
  })

  it("never matches one word form to two terms", () => {
    const owner = new Map<string, string>()
    const clashes: Array<string> = []
    for (const t of terms)
      for (const form of [t.term, ...(t.aliases ?? [])]) {
        const key = t.caseSensitive ? form : form.toLowerCase()
        const prev = owner.get(key)
        if (prev && prev !== t.id) clashes.push(`${form}: ${prev}, ${t.id}`)
        owner.set(key, t.id)
      }
    expect(clashes).toEqual([])
  })

  it("gives every figure alt text", () => {
    const missing = terms
      .filter((t) => t.image && t.image.alt.trim().length < 20)
      .map((t) => t.id)
    expect(missing).toEqual([])
  })

  it("has unique guide ids", () => {
    expect(guideIds.size).toBe(guides.length)
  })
})
