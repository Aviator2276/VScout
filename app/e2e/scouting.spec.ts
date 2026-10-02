// Phase 4 gate (roadmap): scout offline then sync; the same author on two devices hits a conflict
// and resolves it; guests can't scout. Runs against the stateful mock backend (fixtures/backend).
import { expect, test } from "@playwright/test"
import type { BrowserContext, Page } from "@playwright/test"
import {
  CREDENTIALS,
  seedBackend,
  serverRecords,
  useBackend,
} from "./fixtures/backend"

async function signIn(page: Page, to = "/scout") {
  await page.goto(to)
  const username = page.getByLabel("Username")
  const event = page.getByRole("button", { name: /Silicon Valley Regional/ })
  // the shared backend may already hold a session (another "device" signed in)
  await expect(username.or(event)).toBeVisible()
  if (await username.isVisible()) {
    await username.fill(CREDENTIALS.username)
    await page.getByLabel("Password").fill(CREDENTIALS.password)
    await page.getByRole("button", { name: "Sign In" }).click()
  }
  await event.click()
}

/** Steps through the form to Review and submits. */
async function submitForm(
  page: Page,
  label: RegExp = /^(Submit|Save Changes)$/
) {
  const stages = page.getByRole("navigation", { name: "Stage navigation" })
  const submit = stages.getByRole("button", { name: label })
  const next = stages.getByRole("button", { name: /^(Next|Review)$/ })
  for (let i = 0; i < 12; i++) {
    await expect(next.or(submit)).toBeVisible()
    if (await submit.isVisible()) break
    // the button swaps to Submit under the pointer on the last step; retry instead of waiting
    await next.click({ timeout: 1500 }).catch(() => undefined)
  }
  // Submit ignores taps in the first 400 ms after Review opens (a double tap isn't a submit)
  await page.waitForTimeout(450)
  await submit.click()
}

/** Asks the app to sync now (the `online` trigger, sync triggers §9). */
async function syncNow(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("online")))
}

async function openTab(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Tabs" })
    .getByRole("link", { name })
    .click()
}

test("scout a robot offline, then it syncs once (criterion 9)", async ({
  page,
  context,
}) => {
  seedBackend()
  const device = await useBackend(context)
  // visit the screens once online so their code is loaded (Playwright's WebKit has no service
  // worker to serve it offline, pwa-offline §13.2)
  await signIn(page, "/scout")
  await page.getByRole("link", { name: "My Entries" }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: "My Entries" })
  ).toBeVisible()
  // My Entries is a full-screen page: back to the tabs first
  await page.getByRole("button", { name: "Scout" }).click()
  await openMatch(page, 40)
  await page.getByRole("button", { name: "Scout a Robot" }).click()
  await page
    .getByRole("list", { name: "Robots" })
    .getByRole("button")
    .first()
    .click()
  await expect(page).toHaveURL(/\/scouting\/match\//)
  await expect(
    page.getByRole("checkbox", { name: "Robot didn't show up" })
  ).toBeAttached()

  await device.setOffline(true)
  // Konsta draws the switch over a visually hidden checkbox
  await page
    .getByRole("checkbox", { name: "Robot didn't show up" })
    .check({ force: true })
  await submitForm(page)
  await expect(page.getByRole("dialog", { name: "Entry saved" })).toContainText(
    "It will sync when you’re online."
  )
  await page.getByRole("button", { name: "Done" }).click()

  await openTab(page, "Scout")
  await page.getByRole("link", { name: "My Entries" }).click()
  await page.getByRole("radio", { name: "Pending" }).click()
  await expect(
    page.getByRole("list", { name: "Entries" }).getByRole("listitem")
  ).toHaveCount(1)
  await expect(page.getByText("Waiting to sync")).toBeVisible()
  expect(serverRecords("scoutEntry")).toHaveLength(0)

  await device.setOffline(false)
  await syncNow(page)
  await page.getByRole("radio", { name: "Synced" }).click()
  await expect(
    page.getByRole("list", { name: "Entries" }).getByRole("listitem")
  ).toHaveCount(1)
  await expect.poll(() => serverRecords("scoutEntry").length).toBe(1)
  expect(serverRecords("scoutEntry")[0]).toMatchObject({
    rev: 1,
    data: { "pre.noShow": true },
  })
})

/** In-app navigation only: a full page load would drop code the offline steps need. */
async function openMatch(page: Page, n: number) {
  await openTab(page, "Matches")
  await page.getByLabel("Search matches").fill(`q${n}`)
  await expect(page).toHaveURL(new RegExp(`[?&]q=q${n}`))
  await page.getByRole("link", { name: new RegExp(`^Qual ${n}$`) }).click()
}

async function openPitForm(page: Page, team: number) {
  await openTab(page, "Teams")
  await page.getByLabel("Search teams").fill(String(team))
  // number-like values are JSON-quoted in the URL (q=%22254%22)
  await expect(page).toHaveURL(new RegExp(`[?&]q=(%22)?${team}`))
  await page
    .getByRole("list", { name: "Teams" })
    .getByRole("link")
    .first()
    .click()
  await page.getByRole("radio", { name: "Pit" }).click()
  await page.getByRole("button", { name: "Pit Scout" }).click()
}

async function pitScout(page: Page, drivetrain: string) {
  await page.getByRole("radio", { name: drivetrain }).click()
  await submitForm(page)
  await expect(page.getByRole("dialog", { name: /saved/ })).toBeVisible()
  await page.getByRole("button", { name: "Done" }).click()
}

test("the same author edits on two devices: a conflict, resolved by keeping mine", async ({
  browser,
}) => {
  // two devices, each signing in and scouting: longer than the default
  test.setTimeout(90_000)
  seedBackend()
  const devices: Array<BrowserContext> = [
    await browser.newContext(),
    await browser.newContext(),
  ]
  const [, deviceB] = await Promise.all(devices.map((d) => useBackend(d)))
  const [a, b] = await Promise.all(devices.map((d) => d.newPage()))
  if (!a || !b) throw new Error("no pages")
  await signIn(a, "/scout")
  await signIn(b, "/scout")
  await openPitForm(a, 254)

  // device A pit-scouts 254; device B pulls it
  await pitScout(a, "Swerve")
  await expect.poll(() => serverRecords("pitScouting").length).toBe(1)
  await syncNow(b)
  await openTab(b, "Teams")
  await b.getByLabel("Search teams").fill("254")
  await expect(b).toHaveURL(/[?&]q=%22?254/)
  await b.getByRole("list", { name: "Teams" }).getByRole("link").first().click()
  // wait for the detail page itself: its chunk may still be loading under the list
  await expect(b.getByRole("heading", { level: 1, name: "254" })).toBeVisible()
  await b.getByRole("radio", { name: "Pit" }).click()
  await expect(b.getByRole("tabpanel", { name: "Pit" })).toContainText(
    "Swerve",
    {
      timeout: 15_000,
    }
  )
  await b.getByRole("button", { name: "Pit Scout" }).click()
  await expect(
    b.getByText("You already scouted this. Editing your entry.")
  ).toBeVisible()

  // B edits offline; meanwhile A saves another edit online
  await deviceB?.setOffline(true)
  await pitScout(b, "Tank")
  await openPitForm(a, 254)
  await pitScout(a, "Mecanum")
  await expect.poll(() => serverRecords("pitScouting")[0]?.rev).toBe(2)

  // B reconnects: its update was based on rev 1 → 409 → Needs attention
  await deviceB?.setOffline(false)
  await syncNow(b)
  await openTab(b, "Scout")
  await b.getByRole("link", { name: "My Entries" }).click()
  await b.getByRole("radio", { name: "Attention" }).click()
  const row = b.getByRole("list", { name: "Entries" }).getByRole("listitem")
  await expect(row).toHaveCount(1)
  await row.getByRole("button", { name: "Review changes" }).click()
  const sheet = b.getByRole("dialog", { name: "Review Changes" })
  await expect(sheet).toContainText("Someone else saved a newer version")
  await sheet.getByRole("button", { name: "Keep Mine" }).click()
  await syncNow(b)
  await expect
    .poll(() => serverRecords("pitScouting")[0]?.robot)
    .toMatchObject({ drivetrain: "tank" })
  expect(serverRecords("pitScouting")[0]?.rev).toBe(3)
  for (const d of devices) await d.close()
})

test("guests can't scout: no Scout a Robot, no composer, and the form says no access", async ({
  page,
  context,
}) => {
  seedBackend("guest")
  await useBackend(context)
  await page.goto("/login")
  await page.getByRole("button", { name: "Continue as Guest" }).click()
  // six characters submit the code
  await page.getByLabel(/code/i).fill("K7M2QX")
  await expect(
    page.getByRole("heading", { level: 1, name: "Home" })
  ).toBeVisible()

  await openTab(page, "Matches")
  await page.getByLabel("Search matches").fill("q40")
  await expect(page).toHaveURL(/[?&]q=q40/)
  await page.getByRole("link", { name: /^Qual 40$/ }).click()
  await expect(page.getByRole("region", { name: "Red Alliance" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Scout a Robot" })).toHaveCount(
    0
  )

  await openTab(page, "Teams")
  await page
    .getByRole("list", { name: "Teams" })
    .getByRole("link")
    .first()
    .click()
  await page.getByRole("radio", { name: "Notes" }).click()
  await expect(page.getByLabel("Add a note")).toHaveCount(0)

  await openTab(page, "Scout")
  await expect(page.getByText("Needs Scouting")).toHaveCount(0)
  await page.evaluate(() => {
    history.pushState({}, "", "/scouting/match/2026casj_qm40/254")
    dispatchEvent(new PopStateEvent("popstate"))
  })
  await expect(
    page.getByText("You don't have access", { exact: false })
  ).toBeVisible()
})
