// vscout/no-game-terms (ADR-009, game-module.md §9): no season-specific words outside src/games.
// Matches whole words, case-insensitive, in string literals, template text, JSX text and
// identifiers (identifiers are split on camelCase, snake_case and digits, so `fuelCount` hits
// but `notes` and `network` don't). The banned-terms test is the CI gate for CSS and comments.
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"

/** Every games/<id>/terms.json plus games/historical-terms.json. */
export function loadGameTerms(gamesDir) {
  const files = [join(gamesDir, "historical-terms.json")]
  for (const entry of readdirSync(gamesDir, { withFileTypes: true })) {
    const f = join(gamesDir, entry.name, "terms.json")
    if (entry.isDirectory() && existsSync(f)) files.push(f)
  }
  const terms = new Set()
  for (const f of files) {
    if (!existsSync(f)) continue
    for (const t of JSON.parse(readFileSync(f, "utf8")).terms)
      terms.add(t.toLowerCase())
  }
  return terms
}

export function splitWords(text) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
}

export function createRule(terms) {
  return {
    meta: {
      type: "problem",
      docs: { description: "Disallow game-specific terms outside src/games" },
      messages: {
        term: 'Game-specific term "{{term}}" outside src/games (ADR-009). Use the game module.',
      },
      schema: [],
    },
    create(context) {
      const check = (node, text) => {
        if (typeof text !== "string") return
        const hit = splitWords(text).find((w) => terms.has(w))
        if (hit)
          context.report({ node, messageId: "term", data: { term: hit } })
      }
      return {
        Literal: (node) => check(node, node.value),
        TemplateElement: (node) => check(node, node.value.raw),
        JSXText: (node) => check(node, node.value),
        Identifier: (node) => check(node, node.name),
        JSXIdentifier: (node) => check(node, node.name),
      }
    },
  }
}
