// Two projects (guidelines/testing.md): `unit` runs *.test.ts in Node, `dom` runs *.test.tsx in
// jsdom. Both get fake IndexedDB and MSW from src/testing/setup-tests.ts.
import { defineConfig } from "vitest/config"
import viteReact from "@vitejs/plugin-react"
import { buildDefines } from "./scripts/build-defines.ts"

const shared = {
  resolve: { tsconfigPaths: true },
  define: buildDefines(),
}

export default defineConfig({
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          setupFiles: ["src/testing/setup-tests.ts"],
        },
      },
      {
        ...shared,
        plugins: [viteReact()],
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: [
            "src/testing/setup-tests.ts",
            "src/testing/setup-dom.ts",
          ],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/routeTree.gen.ts", "src/**/*.test.*", "src/testing/**"],
      // ≥ 90% on the core modules (testing.md). Enforced per folder once they have code.
      thresholds: {
        "src/lib/sync/**": { lines: 90, branches: 90 },
        "src/lib/db/**": { lines: 90, branches: 90 },
        "src/lib/authorization.ts": { lines: 90, branches: 90 },
        "src/games/**": { lines: 90, branches: 90 },
      },
    },
  },
})
