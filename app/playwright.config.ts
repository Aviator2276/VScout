// E2E runs against the production build served statically like nginx (scripts/serve-static.mjs):
// the service worker only registers in production (pwa-offline.md §13.2). The component gallery is
// dev-only, so its projects run against the dev server. WebKit is the iPhone proxy.
import { defineConfig, devices } from "@playwright/test"

const PORT = 4173
const GALLERY_PORT = 3100
const GALLERY = /gallery\.spec\.ts/

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // flaky test = bug (testing.md)
  // both engines and the dev server run at once: give slow steps room, never retries
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      testIgnore: GALLERY,
      use: { ...devices["Pixel 7"], baseURL: `http://localhost:${PORT}` },
    },
    {
      name: "webkit",
      testIgnore: GALLERY,
      use: { ...devices["iPhone 15"], baseURL: `http://localhost:${PORT}` },
    },
    {
      name: "gallery-chromium",
      testMatch: GALLERY,
      use: {
        ...devices["Pixel 7"],
        baseURL: `http://localhost:${GALLERY_PORT}`,
      },
    },
    {
      name: "gallery-webkit",
      testMatch: GALLERY,
      use: {
        ...devices["iPhone 15"],
        baseURL: `http://localhost:${GALLERY_PORT}`,
      },
    },
  ],
  webServer: [
    {
      command: `node scripts/serve-static.mjs`,
      env: { PORT: String(PORT) },
      port: PORT,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm exec vite dev --port ${GALLERY_PORT} --strictPort`,
      port: GALLERY_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
