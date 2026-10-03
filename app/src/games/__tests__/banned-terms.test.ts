// The CI gate for ADR-009 (game-module.md §9): no game word anywhere in src/ outside src/games.
// TypeScript files are scanned through the AST (string literals, template text, JSX text,
// identifiers split on camelCase); CSS and JSON by whole word. ESLint's vscout/no-game-terms gives
// the same feedback in the editor.
import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import {
  loadGameTerms,
  splitWords,
} from "../../../eslint-rules/no-game-terms.js"
import { gameRegistry } from "../registry"
import { BANNED_TERMS_ALLOW } from "./banned-terms.allow"

const SRC = fileURLToPath(new URL("../..", import.meta.url))
const GAMES = join(SRC, "games")
const SKIP_DIRS = new Set(["games", "testing", "__tests__", "__fixtures__"])

function walk(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : walk(p)
    if (/\.test\.tsx?$/.test(e.name) || e.name === "routeTree.gen.ts") return []
    return /\.(tsx?|css|json)$/.test(e.name) ? [p] : []
  })
}

function wordsInTs(path: string): Array<{ word: string; line: number }> {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true
  )
  const found: Array<{ word: string; line: number }> = []
  const add = (node: ts.Node, text: string) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1
    for (const word of splitWords(text)) found.push({ word, line })
  }
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) add(node, node.text)
    else if (
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    )
      add(node, node.text)
    else if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node))
      add(node, node.text)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

function wordsInText(path: string): Array<{ word: string; line: number }> {
  return readFileSync(path, "utf8")
    .split("\n")
    .flatMap((text, i) =>
      splitWords(text).map((word) => ({ word, line: i + 1 }))
    )
}

describe("no game terms outside src/games (ADR-009)", () => {
  it("finds none", async () => {
    const modules = await Promise.all(
      Object.values(gameRegistry).map((load) => load())
    )
    const banned = new Set([
      ...loadGameTerms(GAMES),
      ...modules.flatMap((g) => g.bannedTerms.map((t) => t.toLowerCase())),
    ])
    const allowed = new Set(BANNED_TERMS_ALLOW)
    const hits: Array<string> = []
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file)
      const words = /\.tsx?$/.test(file) ? wordsInTs(file) : wordsInText(file)
      for (const { word, line } of words)
        if (banned.has(word) && !allowed.has(`${rel}:${word}`))
          hits.push(`src/${rel}:${line} "${word}"`)
    }
    expect(hits).toEqual([])
  })
})
