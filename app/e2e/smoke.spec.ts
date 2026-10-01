import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { version: string }

// Phase 0 gate: the built shell loads, carries the PWA head, and has no axe violations.
test("the app shell loads with its manifest and version", async ({
  page,
  request,
}) => {
  await page.goto("/")
  await expect(page).toHaveTitle("VScout")
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest"
  )

  const version = (await (await request.get("/version.json")).json()) as {
    version: string
  }
  expect(version.version).toBe(pkg.version)

  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
