//  @ts-check
// Architecture rules: .plan/architecture/project-structure.md §5. The TanStack config registers
// eslint-plugin-import-x under the "import" prefix, so the rules are `import/...`.
import { fileURLToPath } from "node:url"
import { tanstackConfig } from "@tanstack/eslint-config"
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript"
import checkFile from "eslint-plugin-check-file"
import { createRule, loadGameTerms } from "./eslint-rules/no-game-terms.js"

const gameTerms = loadGameTerms(
  fileURLToPath(new URL("./src/games", import.meta.url))
)

const FEATURES = [
  "admin",
  "alliance-selection",
  "auth",
  "comments",
  "events",
  "help",
  "home-widgets",
  "matches",
  "media",
  "messages",
  "notifications",
  "picklists",
  "scouting",
  "settings",
  "strategy",
  "sync-status",
  "teams",
]
const APP = ["./src/routes", "./src/app", "./src/router.tsx"]
// shared inner order: each folder may import only folders to its left
const SHARED_ORDER = [
  "types",
  "utils",
  "games",
  "config",
  "lib",
  "content",
  "stores",
  "hooks",
  "components",
]

const resolver = createTypeScriptImportResolver({ project: "./tsconfig.json" })

export default [
  ...tanstackConfig,
  {
    rules: {
      "import/no-cycle": "off",
      "import/order": "off",
      "import/consistent-type-specifier-style": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/require-await": "off",
      "pnpm/json-enforce-catalog": "off",
    },
  },
  {
    // Strictness (PV-13, Definition of Done: no `any`)
    files: ["**/*.{ts,tsx}"],
    rules: {
      eqeqeq: ["error", "always"],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/only-throw-error": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "check-file": checkFile,
      vscout: { rules: { "no-game-terms": createRule(gameTerms) } },
    },
    settings: {
      "import-x/resolver-next": [resolver],
      "import/resolver-next": [resolver],
    },
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            // 1. no cross-feature imports
            ...FEATURES.map((f) => ({
              target: `./src/features/${f}`,
              from: "./src/features",
              except: [`./${f}`],
              message:
                "Cross-feature import. Compose in a route or move the code to a shared folder.",
            })),
            // 2. features never import the app layer
            { target: "./src/features", from: APP },
            // 3. shared never imports features or the app layer
            {
              target: SHARED_ORDER.map((d) => `./src/${d}`),
              from: ["./src/features", ...APP],
              message: "Shared code must not depend on features or routes.",
            },
            // 4. shared inner order
            ...SHARED_ORDER.map((d, i) => ({
              target: `./src/${d}`,
              from: SHARED_ORDER.slice(i + 1).map((x) => `./src/${x}`),
              message: `src/${d} may only import shared folders listed before it (${SHARED_ORDER.join(" ← ")}).`,
            })).filter((z) => z.from.length > 0),
            // 5. production code never imports testing utilities
            { target: "./src", from: "./src/testing" },
            // 6. only the game registry and config pick a concrete game (game-module.md §9)
            {
              target: "./src",
              from: "./src/games/2026-rebuilt",
              except: ["./games", "./config/game.ts"],
              message:
                "Import @/games/types or @/config/game, not a concrete game.",
            },
          ],
        },
      ],

      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@tanstack/react-start",
              importNames: [
                "createServerFn",
                "createServerOnlyFn",
                "createMiddleware",
              ],
              message:
                "VScout is a static SPA. There is no server runtime (ADR-001).",
            },
            {
              name: "dexie",
              importNames: ["default"],
              message: "Use the db from @/lib/db/db.",
            },
          ],
          patterns: [
            {
              group: [
                "@tanstack/react-start/server",
                "@tanstack/react-start/server-*",
              ],
              message: "No server code (ADR-001).",
            },
            {
              regex: "^@/features/[^/]+(/index)?$",
              message: "No barrels. Import the file directly.",
            },
          ],
        },
      ],

      "vscout/no-game-terms": "error",

      // naming (routes follow TanStack conventions)
      "check-file/filename-naming-convention": [
        "error",
        { "src/!(routes)/**/*.{ts,tsx}": "KEBAB_CASE" },
        { ignoreMiddleExtensions: true },
      ],
      "check-file/folder-naming-convention": [
        "error",
        { "src/!(routes)/**/!(__tests__|__fixtures__)": "KEBAB_CASE" },
      ],
      "check-file/filename-blocklist": [
        "error",
        { "src/!(routes)/**/index.{ts,tsx}": "*.{ts,tsx} (no barrel files)" },
      ],
    },
  },
  // games use their own words; lib/db owns the Dexie import
  { files: ["src/games/**"], rules: { "vscout/no-game-terms": "off" } },
  { files: ["src/lib/db/**"], rules: { "no-restricted-imports": "off" } },
  // tests may import testing/ and anything else
  {
    files: [
      "src/**/__tests__/**",
      "src/**/*.test.{ts,tsx}",
      "src/testing/**",
      "e2e/**",
    ],
    rules: {
      "import/no-restricted-paths": "off",
      "vscout/no-game-terms": "off",
    },
  },
  {
    ignores: [
      "eslint.config.js",
      "eslint-rules/**",
      "scripts/**/*.mjs",
      ".prettierrc",
      "dist",
      ".sw-build",
      "src/routeTree.gen.ts",
      "src/components/ui/**",
      "lint-canary/**",
    ],
  },
]
