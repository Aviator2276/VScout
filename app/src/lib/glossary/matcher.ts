// Finds glossary terms in free text (features/glossary-help.md §6). One regex from every term and
// alias, longest first ("defense bot" beats "defense"), with Unicode word boundaries so "bump"
// never matches inside "bumper". Inflections are explicit aliases: no stemming.
import type { GlossaryTerm } from "@/types/glossary"

export type Segment = string | { termId: string; text: string }

export interface Matcher {
  segment: (text: string) => ReadonlyArray<Segment>
}

const LRU_SIZE = 500
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export function createMatcher(terms: ReadonlyArray<GlossaryTerm>): Matcher {
  const insensitive = new Map<string, string>()
  const sensitive = new Map<string, string>()
  for (const t of terms)
    for (const form of [t.term, ...(t.aliases ?? [])]) {
      if (t.caseSensitive) sensitive.set(form, t.id)
      else insensitive.set(form.toLowerCase(), t.id)
    }
  const forms = [...new Set([...sensitive.keys(), ...insensitive.keys()])].sort(
    (a, b) => b.length - a.length
  )
  const empty: Matcher = { segment: (text) => (text ? [text] : []) }
  if (forms.length === 0) return empty
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${forms.map(escape).join("|")})(?![\\p{L}\\p{N}])`,
    "giu"
  )
  const cache = new Map<string, ReadonlyArray<Segment>>()

  function compute(text: string): ReadonlyArray<Segment> {
    const out: Array<Segment> = []
    let last = 0
    for (const m of text.matchAll(re)) {
      const found = m[0]
      // the regex is case-insensitive; a case-sensitive term only counts when the case matches
      const termId =
        sensitive.get(found) ?? insensitive.get(found.toLowerCase())
      if (termId === undefined) continue
      const at = m.index
      if (at > last) out.push(text.slice(last, at))
      out.push({ termId, text: found })
      last = at + found.length
    }
    if (last < text.length) out.push(text.slice(last))
    return out
  }

  return {
    segment(text) {
      const hit = cache.get(text)
      if (hit) {
        cache.delete(text)
        cache.set(text, hit)
        return hit
      }
      const value = compute(text)
      cache.set(text, value)
      if (cache.size > LRU_SIZE) {
        const oldest = cache.keys().next()
        if (!oldest.done) cache.delete(oldest.value)
      }
      return value
    },
  }
}

/** "First per paragraph": later occurrences of a term in the same paragraph become plain text. */
export function firstPerParagraph(
  segments: ReadonlyArray<Segment>
): Array<Segment> {
  const seen = new Set<string>()
  return segments.map((s) => {
    if (typeof s === "string") return s
    if (seen.has(s.termId)) return s.text
    seen.add(s.termId)
    return s
  })
}

/** Core terms first, then the game module, then team terms; later sources win by id. */
export function mergeTerms(
  ...sources: ReadonlyArray<ReadonlyArray<GlossaryTerm>>
): Array<GlossaryTerm> {
  const byId = new Map<string, GlossaryTerm>()
  for (const list of sources) for (const t of list) byId.set(t.id, t)
  return [...byId.values()].sort((a, b) => a.term.localeCompare(b.term))
}
