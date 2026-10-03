// Glossary and guide types (ADR-055/058, features/glossary-help.md). Shared by lib/glossary,
// content/ and every game module.
export type GlossaryCategory =
  "game" | "robot" | "match" | "strategy" | "vscout"

export interface GlossaryTerm {
  /** stable slug, e.g. 'disabled' */
  id: string
  term: string
  /** explicit forms that also match: 'disables', 'disabled robot' */
  aliases?: ReadonlyArray<string>
  /** ≤ 140 chars, used in aria-description and list rows */
  short: string
  /** markdown */
  body?: string
  category: GlossaryCategory
  related?: ReadonlyArray<string>
  seeAlsoGuide?: string
  image?: { src: string; alt: string }
  /** for acronyms like 'EPA' vs the word 'epa' */
  caseSensitive?: boolean
  source: "core" | "game" | "team"
}

export interface GuideMeta {
  id: string
  title: string
  summary: string
  audience: "all" | "new" | "admin"
  /** markdown loaded lazily via ?raw */
  load: () => Promise<{ default: string }>
}
