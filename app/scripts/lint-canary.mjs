// Phase 0 gate (roadmap.md, gap T14): proves the architecture lint rules actually fire.
// Plants one violation per rule as real files under src/, lints them, then deletes them.
// Fails if any planted violation is NOT reported (a silently disabled rule) or if a clean
// control file IS reported.
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { ESLint } from "eslint"

const P = "lint-canary"
const files = {
  [`src/features/teams/${P}-target.ts`]: `export const target = 1\n`,
  [`src/features/matches/${P}-cross.ts`]: `import { target } from "@/features/teams/${P}-target"\nexport const x = target\n`,
  [`src/lib/${P}-shared.ts`]: `import { target } from "../features/teams/${P}-target"\nexport const y = target\n`,
  [`src/utils/${P}-order.ts`]: `import { z } from "@/lib/${P}-control"\nexport const order = z\n`,
  [`src/lib/${P}-control.ts`]: `export const z = 1\n`,
  [`src/utils/${P}-term.ts`]: `export const label = "Fuel scored"\n`,
  [`src/utils/${P}-any.ts`]: `export function f(a: any): number {\n  return a as number\n}\n`,
  [`src/utils/${P}-eq.ts`]: `export function g(a: number, b: number): boolean {\n  return a == b\n}\n`,
  [`src/utils/${P}-server.ts`]: `import { createServerFn } from "@tanstack/react-start"\nexport const s = createServerFn\n`,
  [`src/utils/LintCanaryCase.ts`]: `export const c = 1\n`,
  [`src/features/${P}-barrel/index.ts`]: `export const b = 1\n`,
  [`src/lib/${P}-game.ts`]: `import { phases } from "@/games/2026-rebuilt/phases"\nexport const p = phases\n`,
  [`src/features/matches/${P}-konsta.ts`]: `import { List } from "konsta/react"\nexport const k = List\n`,
  [`src/features/matches/${P}-lucide.ts`]: `import { Check } from "lucide-react"\nexport const c = Check\n`,
  [`src/features/matches/${P}-live.ts`]: `import { useLiveQuery } from "dexie-react-hooks"\nexport const q = useLiveQuery\n`,
  [`src/hooks/${P}-hooks.ts`]: `import { useState } from "react"\n\nexport function useBad(flag: boolean): number {\n  if (flag) return 0\n  const [n] = useState(1)\n  return n\n}\n`,
  [`src/components/list/${P}-wrapper.ts`]: `import { List } from "konsta/react"\n\nexport const w = List\n`,
  [`src/features/matches/${P}-fetch.ts`]: `export const load = () => fetch("/api/matches")\n`,
}
const expected = {
  [`src/features/matches/${P}-cross.ts`]: "import/no-restricted-paths",
  [`src/lib/${P}-shared.ts`]: "import/no-restricted-paths",
  [`src/utils/${P}-order.ts`]: "import/no-restricted-paths",
  [`src/utils/${P}-term.ts`]: "vscout/no-game-terms",
  [`src/utils/${P}-any.ts`]: "@typescript-eslint/no-explicit-any",
  [`src/utils/${P}-eq.ts`]: "eqeqeq",
  [`src/utils/${P}-server.ts`]: "no-restricted-imports",
  [`src/utils/LintCanaryCase.ts`]: "check-file/filename-naming-convention",
  [`src/features/${P}-barrel/index.ts`]: "check-file/filename-blocklist",
  [`src/lib/${P}-game.ts`]: "import/no-restricted-paths",
  [`src/features/matches/${P}-konsta.ts`]: "no-restricted-imports",
  [`src/features/matches/${P}-lucide.ts`]: "no-restricted-imports",
  [`src/features/matches/${P}-live.ts`]: "no-restricted-imports",
  [`src/hooks/${P}-hooks.ts`]: "react-hooks/rules-of-hooks",
  [`src/features/matches/${P}-fetch.ts`]: "no-restricted-globals",
}
const clean = [
  `src/lib/${P}-control.ts`,
  `src/features/teams/${P}-target.ts`,
  `src/components/list/${P}-wrapper.ts`,
]

let failed = false
try {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  const results = await new ESLint().lintFiles(Object.keys(files))
  const byFile = new Map(
    results.map((r) => [r.filePath.slice(process.cwd().length + 1), r.messages])
  )
  for (const [path, rule] of Object.entries(expected)) {
    const ok = (byFile.get(path) ?? []).some((m) => m.ruleId === rule)
    console.log(`${ok ? "ok  " : "FAIL"} ${rule} in ${path}`)
    if (!ok) failed = true
  }
  for (const path of clean) {
    const msgs = byFile.get(path) ?? []
    const ok = msgs.length === 0
    console.log(`${ok ? "ok  " : "FAIL"} clean control ${path}`)
    if (!ok) {
      failed = true
      msgs.forEach((m) => console.log(`       ${m.ruleId}: ${m.message}`))
    }
  }
} finally {
  for (const path of Object.keys(files)) rmSync(path, { force: true })
  rmSync(`src/features/${P}-barrel`, { recursive: true, force: true })
}
if (failed) {
  console.error(
    "[lint-canary] a lint rule didn't fire. Architecture rules aren't enforced."
  )
  process.exit(1)
}
console.log("[lint-canary] every planted violation was caught")
