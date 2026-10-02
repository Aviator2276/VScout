// Builds src/sw/sw.ts → .sw-build/sw.js (one IIFE file). scripts/inject-sw-manifest.mjs then
// injects the precache manifest into dist/client/sw.js (ADR-050, pwa-offline.md §1).
import { defineConfig } from "vite"
import { buildDefines } from "./scripts/build-defines.ts"

export default defineConfig({
  publicDir: false,
  define: {
    ...buildDefines(),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: ".sw-build",
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    lib: {
      entry: "src/sw/sw.ts",
      formats: ["iife"],
      name: "vscoutSw",
      fileName: () => "sw.js",
    },
  },
})
