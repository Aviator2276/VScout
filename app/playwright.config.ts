// E2E runs against the production build served statically like nginx (scripts/serve-static.mjs),
// never the dev server: the service worker only registers in production (pwa-offline.md §13.2).
// WebKit is the iPhone proxy.
import { defineConfig, devices } from "@playwright/test"

const PORT = 4173

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // flaky test = bug (testing.md)
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Pixel 7"] } },
    { name: "webkit", use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    command: `node scripts/serve-static.mjs`,
    env: { PORT: String(PORT) },
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
})
