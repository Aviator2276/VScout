// Phase 6: Settings pages and the Help panel against the stateful mock backend.
import { expect, test } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"
import {
  CREDENTIALS,
  seedBackend,
  serverRecords,
  useBackend,
} from "./fixtures/backend"

async function signIn(page: Page, to = "/") {
  await page.goto(to)
  await page.getByLabel("Username").fill(CREDENTIALS.username)
  await page.getByLabel("Password").fill(CREDENTIALS.password)
  await page.getByRole("button", { name: "Sign In" }).click()
  await page.getByRole("button", { name: /Silicon Valley Regional/ }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Home" })
  ).toBeVisible()
}

async function openSettings(page: Page) {
  await page.getByRole("link", { name: "Settings" }).first().click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" })
  ).toBeVisible()
}

test.beforeEach(async ({ context }) => {
  seedBackend()
  await useBackend(context)
})

test("Help: open from Home, search, open a term and a related term, Back, Done", async ({
  page,
}) => {
  await signIn(page)
  await page.getByRole("button", { name: "Help" }).click()
  const panel = page.getByRole("dialog", { name: "Help" })
  await expect(panel).toBeVisible()
  await expect(page).toHaveURL(/help=glossary/)
  await panel.getByRole("searchbox").fill("picklist")
  await panel
    .getByRole("button", { name: /^Picklist/ })
    .first()
    .click()
  const term = page.getByRole("dialog", { name: "Picklist" })
  await expect(term).toContainText("A ranked list of teams")
  await term.getByRole("button", { name: /^Followed picklist/ }).click()
  await expect(
    page.getByRole("dialog", { name: "Followed picklist" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Back" }).click()
  await expect(page.getByRole("dialog", { name: "Picklist" })).toBeVisible()
  await page.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page).not.toHaveURL(/help=/)
})

test("Help: Need help? on the login screen opens the guides", async ({
  page,
}) => {
  await page.goto("/login")
  await page.getByRole("button", { name: "Need help?" }).click()
  await page.getByRole("button", { name: /^Installing on iPhone/ }).click()
  await expect(
    page.getByRole("dialog", { name: "Installing on iPhone" })
  ).toContainText("Add to Home Screen")
})

test("Account: Change Password rejects a wrong current password, then succeeds", async ({
  page,
}) => {
  await signIn(page)
  await openSettings(page)
  await page.locator('a[href="/settings/account"]').click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Account" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Change Password" }).click()
  const sheet = page.getByRole("dialog", { name: "Change Password" })
  await sheet.getByLabel("Current password").fill("wrong one")
  await sheet.getByLabel("New password").fill("a brand new passphrase")
  await sheet.getByRole("button", { name: "Change Password" }).click()
  await expect(sheet).toContainText("Your current password isn’t right.")
  await sheet.getByLabel("Current password").fill(CREDENTIALS.password)
  await sheet.getByRole("button", { name: "Change Password" }).click()
  await expect(page.getByText("Password changed")).toBeVisible()
})

test("Recently Deleted: a deleted note comes back with Restore", async ({
  page,
}) => {
  await signIn(page)
  await page.goto("/teams/254?view=notes")
  await page.getByLabel("Add a note").fill("Strong climber, watch the battery")
  await page.getByRole("button", { name: "Add Note" }).click()
  await expect.poll(() => serverRecords("comment").length).toBe(1)
  await page.getByRole("button", { name: "Delete note" }).click()
  await expect(page.getByText("Note deleted")).toBeVisible()
  await expect.poll(() => serverRecords("comment").length).toBe(0)

  // in-app navigation: a reload here could cut off the delete's acknowledgement
  await page.getByRole("link", { name: "Home" }).click()
  await openSettings(page)
  await page.getByRole("link", { name: "Recently Deleted" }).click()
  await page.getByRole("button", { name: /Strong climber/ }).click()
  await expect(
    page.getByText("Restored", { exact: true }).first()
  ).toBeVisible()
  await expect.poll(() => serverRecords("comment").length).toBe(1)
  await expect(
    page.getByText("Nothing deleted in the last 30 days")
  ).toBeVisible()
})

test("Storage: version, the transport override and the clear-cache confirmation", async ({
  page,
}) => {
  await signIn(page)
  await openSettings(page)
  await page.getByRole("link", { name: "Storage & Diagnostics" }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Storage & Diagnostics" })
  ).toBeVisible()
  await expect(page.getByText(/^Build /)).toBeVisible()
  await page.getByRole("button", { name: "HTTP Only" }).click()
  await expect(
    page
      .getByRole("button", { name: "HTTP Only" })
      .locator("xpath=ancestor::li")
  ).toContainText("✓")
  await page
    .getByRole("button", { name: "Clear Cache and Re-download" })
    .click()
  const alert = page.getByRole("alertdialog", {
    name: "Clear Cache and Re-download?",
  })
  await expect(alert).toBeVisible()
  await alert.getByRole("button", { name: "Cancel" }).click()
  await expect(alert).toHaveCount(0)
})

async function axe(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((a) => a.effect?.getTiming().iterations !== Infinity)
      .every((a) => a.playState !== "running")
  )
  const r = await new AxeBuilder({ page })
    .exclude("[data-base-ui-focus-guard]")
    .analyze()
  return r.violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`)
  )
}

for (const scheme of ["light", "dark"] as const)
  test(`a11y (${scheme}): Settings, its pages and the Help panel pass axe`, async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await page.emulateMedia({ colorScheme: scheme })
    await signIn(page)
    await openSettings(page)
    expect(await axe(page), "settings").toEqual([])
    for (const [link, heading] of [
      ['a[href="/settings/account"]', "Account"],
      ['a[href="/settings/appearance"]', "Appearance"],
      ['a[href="/settings/scouting"]', "Scouting"],
      ['a[href="/settings/storage"]', "Storage & Diagnostics"],
      ['a[href="/settings/recently-deleted"]', "Recently Deleted"],
      ['a[href="/settings/about"]', "About"],
    ] as const) {
      await page.locator(link).click()
      await expect(
        page.getByRole("heading", { level: 1, name: heading })
      ).toBeVisible()
      expect(await axe(page), heading).toEqual([])
      await page.getByRole("button", { name: "Settings" }).click()
    }
    await page.getByRole("button", { name: "Open Help" }).click()
    await expect(page.getByRole("dialog", { name: "Help" })).toBeVisible()
    expect(await axe(page), "help").toEqual([])
  })

test("Send Feedback: a testing build embeds the form, loaded only on that page", async ({
  page,
  context,
}) => {
  let formRequests = 0
  await context.route("https://docs.google.com/**", (route) => {
    formRequests++
    return route.fulfill({
      contentType: "text/html",
      body: "<p>Feedback form</p>",
    })
  })
  await signIn(page)
  await openSettings(page)
  expect(formRequests).toBe(0)
  await page.getByRole("link", { name: "Send Feedback" }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Send Feedback" })
  ).toBeVisible()
  const frame = page.locator('iframe[title="VScout feedback form"]')
  await expect(frame).toHaveAttribute(
    "src",
    /docs\.google\.com\/forms\/.+embedded=true/
  )
  await expect(
    page
      .frameLocator('iframe[title="VScout feedback form"]')
      .getByText("Feedback form")
  ).toBeVisible()
  expect(formRequests).toBeGreaterThan(0)
})
