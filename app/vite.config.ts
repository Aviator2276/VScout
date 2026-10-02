import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { buildDefines } from "./scripts/build-defines.ts"

// Static SPA (ADR-001): Start prerenders only the shell to dist/client/index.html.
// Deploy dist/client. The service worker is a separate build (vite.sw.config.ts, ADR-050).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  define: buildDefines(),
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: { outputPath: "/index.html", crawlLinks: false },
      },
      router: {
        // keep in sync with tsr.config.json
        routeFileIgnorePattern: "\\.test\\.tsx?$",
      },
    }),
    viteReact(),
  ],
})
