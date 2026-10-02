import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import { CREDENTIALS, mockApi } from "./fixtures/mock-api"

// Phase 2 part 3: sign in, pick an event, move between tabs, keep working offline.
test("sign in → pick an event → tabs, then offline", async ({
  page,
  context,
  browserName,
}) => {
  await mockApi(page)
  await page.goto("/teams")

  // the guard keeps the way back
  await expect(page).toHaveURL(/\/login\?redirect=%2Fteams/)
  await expect(page.getByRole("heading", { name: "VScout" })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  await page.getByLabel("Username").fill(CREDENTIALS.username)
  await page.getByLabel("Password").fill(CREDENTIALS.password)
  await page.getByRole("button", { name: "Sign In" }).click()

  // no active event yet → onboarding, then back to where we were going
  await expect(
    page.getByRole("heading", { name: "Choose an Event" })
  ).toBeVisible()
  await page.getByRole("button", { name: /Silicon Valley Regional/ }).click()
  await expect(page).toHaveURL(/\/teams$/)
  await expect(
    page.getByRole("heading", { level: 1, name: "Teams" })
  ).toBeVisible()

  const tabs = page.getByRole("navigation", { name: "Tabs" })
  await tabs.getByRole("link", { name: "Home" }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Home" })
  ).toBeVisible()
  await expect(page.getByText("Silicon Valley Regional")).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  for (const name of ["Matches", "Scout", "Home"]) {
    await tabs.getByRole("link", { name }).click()
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
  }

  // settings sits in Home's stack
  await page.getByRole("link", { name: "Settings" }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" })
  ).toBeVisible()
  await expect(tabs.getByRole("link", { name: "Home" })).toHaveAttribute(
    "aria-current",
    "page"
  )

  // offline: the shell keeps working from this device
  await context.setOffline(true)
  await tabs.getByRole("link", { name: "Teams" }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Teams" })
  ).toBeVisible()
  await expect(page.getByText(/You're offline/)).toBeVisible()

  // a cold start offline needs the service worker; Playwright's WebKit can't run it (pwa-offline §13.2)
  if (browserName === "chromium") {
    await context.setOffline(false)
    await page.evaluate(() =>
      navigator.serviceWorker.ready.then(() => undefined)
    )
    await context.setOffline(true)
    await page.reload()
    await expect(
      page.getByRole("heading", { level: 1, name: "Teams" })
    ).toBeVisible()
    await expect(page.getByText(/You're offline/)).toBeVisible()
  }
})

test("a wrong password is explained", async ({ page }) => {
  await mockApi(page)
  await page.goto("/login")
  await page.getByLabel("Username").fill("alex")
  await page.getByLabel("Password").fill("wrong")
  await page.getByRole("button", { name: "Sign In" }).click()
  await expect(page.getByRole("alert")).toHaveText(/don't match/)
})

test("sign out and back in, with no console errors", async ({ page }) => {
  // React warnings (nested links) and render crashes (a closed database) are bugs
  const problems: Array<string> = []
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`))
  page.on("console", (m) => {
    const text = m.text()
    // the e2e server has no MQTT broker
    if (m.type() === "error" && !/WebSocket|Failed to load resource/.test(text))
      problems.push(`console: ${text.slice(0, 200)}`)
  })
  await mockApi(page)
  await page.goto("/login")
  const signIn = async () => {
    await page.getByLabel("Username").fill(CREDENTIALS.username)
    await page.getByLabel("Password").fill(CREDENTIALS.password)
    await page.getByRole("button", { name: "Sign In" }).click()
  }
  await signIn()
  await page.getByRole("button", { name: /Silicon Valley Regional/ }).click()
  await page.getByRole("link", { name: "Settings" }).click()
  await page.getByRole("link", { name: "Event" }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Event" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Settings" }).click()

  await page.locator('a[href="/settings/account"]').click()
  await page.getByRole("button", { name: "Sign Out" }).click()
  await expect(page.getByRole("heading", { name: "VScout" })).toBeVisible()
  await expect(page).toHaveURL(/\/login/)

  // the wiped database reopens: signing in again works and asks for the event again
  await signIn()
  await expect(
    page.getByRole("heading", { name: "Choose an Event" })
  ).toBeVisible()
  await page.getByRole("button", { name: /Silicon Valley Regional/ }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Home" })
  ).toBeVisible()
  expect(problems).toEqual([])
})
