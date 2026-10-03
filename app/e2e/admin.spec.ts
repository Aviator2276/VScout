// Phase 7: Settings → Admin and guest access end to end, against the stateful mock backend.
import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import {
  CREDENTIALS,
  backend,
  seedBackend,
  serverRecords,
  useBackend,
} from "./fixtures/backend"

async function signIn(page: Page) {
  await page.goto("/login")
  await page.getByLabel("Username").fill(CREDENTIALS.username)
  await page.getByLabel("Password").fill(CREDENTIALS.password)
  await page.getByRole("button", { name: "Sign In" }).click()
  await page.getByRole("button", { name: /Silicon Valley Regional/ }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Home" })
  ).toBeVisible()
}

async function openAdmin(page: Page, row: string) {
  await page.getByRole("link", { name: "Settings" }).first().click()
  await page.getByRole("link", { name: "Admin", exact: true }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin" })
  ).toBeVisible()
  await page.getByRole("link", { name: row }).click()
  await expect(page.getByRole("heading", { level: 1, name: row })).toBeVisible()
}

async function back(page: Page) {
  await page.getByRole("button", { name: "Admin" }).click()
}

test("a scouter has no Admin group, and admin pages say no access (criterion 1)", async ({
  page,
  context,
}) => {
  seedBackend("scouter")
  await useBackend(context)
  await signIn(page)
  await page.getByRole("link", { name: "Settings" }).first().click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" })
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Admin", exact: true })
  ).toHaveCount(0)
  await page.evaluate(() => {
    history.pushState({}, "", "/settings/admin/users")
    dispatchEvent(new PopStateEvent("popstate"))
  })
  await expect(
    page.getByText("You don't have access", { exact: false })
  ).toBeVisible()
})

test("admin: event setup, team number and users reach the server", async ({
  page,
  context,
}) => {
  seedBackend("admin")
  await useBackend(context)
  await signIn(page)
  await openAdmin(page, "Event Setup")
  // never created: create with defaults, then close scouting
  await page.getByRole("button", { name: "Create with Defaults" }).click()
  await page
    .getByRole("checkbox", { name: "Scouting open", exact: true })
    .locator("xpath=..")
    .click()
  await expect
    .poll(() => serverRecords("eventSettings")[0]?.scoutingOpen)
    .toBe(false)

  await back(page)
  await page.getByRole("link", { name: "Team Number" }).click()
  await page.getByLabel("Our team number").fill("254")
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Team number set to 254")).toBeVisible()
  await expect
    .poll(() => serverRecords("teamSettings")[0]?.teamNumber)
    .toBe(254)

  await back(page)
  await page.getByRole("link", { name: "Users & Roles" }).click()
  await expect(page.getByRole("link", { name: /Alex/ })).toBeVisible()
  await page.getByRole("button", { name: "New User" }).click()
  const sheet = page.getByRole("dialog", { name: "New User" })
  await sheet.getByLabel("Name", { exact: true }).fill("Sam")
  await sheet.getByLabel("Username").fill("sam")
  await sheet.getByRole("button", { name: "Create Account" }).click()
  await expect(
    page.getByRole("dialog", { name: "Account Created" })
  ).toContainText("shown only once")
  await page.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByRole("link", { name: /Sam/ })).toBeVisible()
  // the only admin can't demote themselves (criterion 4)
  await page.getByRole("link", { name: /Alex/ }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Alex" })
  ).toBeVisible()
  await page
    .getByRole("radiogroup", { name: "Role" })
    .getByRole("radio", { name: "Scouter", exact: true })
    .click()
  await expect(page.getByText("At least one admin is required.")).toBeVisible()
})

test("guest access: an admin turns it on, a guest joins with that code; a new code locks the old one out", async ({
  browser,
}) => {
  test.setTimeout(90_000)
  seedBackend("admin")
  const adminCtx = await browser.newContext()
  await useBackend(adminCtx)
  const admin = await adminCtx.newPage()
  await signIn(admin)
  await openAdmin(admin, "Guest Access")
  await admin
    .getByRole("checkbox", { name: "Allow guests at this event" })
    .locator("xpath=..")
    .click()
  await admin
    .getByRole("alertdialog", { name: "Allow Guests?" })
    .getByRole("button", { name: "Allow Guests" })
    .click()
  const codeEl = admin.getByLabel(/^Guest code /)
  await expect(codeEl).toBeVisible()
  const code = ((await codeEl.textContent()) ?? "").trim()
  expect(code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/)

  // a guest on another device joins with that code (ADR-066)
  backend.role = "guest"
  // the mock's cookie stand-in is shared: a fresh device starts signed out
  backend.signedIn = false
  const guestCtx = await browser.newContext()
  await useBackend(guestCtx)
  const guest = await guestCtx.newPage()
  await guest.goto("/login")
  await guest.getByRole("button", { name: "Continue as Guest" }).click()
  await guest.getByLabel(/code/i).fill(code)
  await expect(
    guest.getByRole("heading", { level: 1, name: "Home" })
  ).toBeVisible()
  await guestCtx.close()

  // a new code: the old one stops working
  backend.role = "admin"
  await admin.getByRole("button", { name: "Generate New Code" }).click()
  await admin
    .getByRole("alertdialog", { name: "Make a New Code?" })
    .getByRole("button", { name: "New Code" })
    .click()
  await expect(codeEl).not.toHaveText(code)
  backend.role = "guest"
  backend.signedIn = false
  const late = await browser.newContext()
  await useBackend(late)
  const page = await late.newPage()
  await page.goto("/login")
  await page.getByRole("button", { name: "Continue as Guest" }).click()
  await page.getByLabel(/code/i).fill(code)
  await expect(
    page.getByText("That code didn't work. Check it with your admin.")
  ).toBeVisible()
  await late.close()
  await adminCtx.close()
})

test("announcements, moderation with a reason, and export", async ({
  page,
  context,
}) => {
  seedBackend("admin")
  // a team note from another scouter
  const note = {
    id: "01900000-0000-7000-8000-0000000c0001",
    rev: 1,
    updatedAt: "2026-03-20T15:00:00.000Z",
    createdAt: "2026-03-20T15:00:00.000Z",
    eventKey: "2026casj",
    authorId: "01900000-0000-7000-8000-000000009999",
    teamNumber: 254,
    body: "Spam spam spam",
    tags: [],
    visibility: "team",
  }
  backend.records.set(`comment:${note.id}`, note)
  backend.append("event:2026casj", "comment", {
    v: 1,
    entity: "comment",
    op: "upsert",
    id: note.id,
    rev: 1,
    eventKey: "2026casj",
    ts: note.updatedAt,
    data: note,
  })
  await useBackend(context)
  await signIn(page)
  await openAdmin(page, "Announcements")
  await page.getByLabel("New announcement").fill("Lunch until 1:15")
  await page
    .getByRole("checkbox", { name: "Urgent" })
    .locator("xpath=..")
    .click()
  await page.getByRole("button", { name: "Post" }).click()
  await expect(page.getByRole("list", { name: "Announcements" })).toContainText(
    "Lunch until 1:15"
  )
  await expect
    .poll(
      () =>
        serverRecords("message").filter(
          (m) => m.kind === "announcement" && m.priority === "urgent"
        ).length
    )
    .toBe(1)

  await back(page)
  await page.getByRole("link", { name: "Moderation" }).click()
  await expect(page.getByRole("list", { name: "Team notes" })).toContainText(
    "Spam spam spam"
  )
  await page.getByRole("button", { name: /^Delete note by/ }).click()
  await page
    .getByRole("dialog", { name: "Delete Note" })
    .getByLabel("Reason")
    .fill("duplicate")
  await page
    .getByRole("dialog", { name: "Delete Note" })
    .getByRole("button", { name: "Delete Note" })
    .click()
  await expect.poll(() => serverRecords("comment").length).toBe(0)
  await expect
    .poll(() => backend.audit.map((a) => a.reason))
    .toEqual(["duplicate"])

  await back(page)
  await page.getByRole("link", { name: "Export" }).click()
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: /Everything \(JSON\)/ }).click()
  expect((await download).suggestedFilename()).toBe("2026casj-export.json")
})

test("a11y: admin pages pass axe", async ({ page, context }) => {
  test.setTimeout(90_000)
  seedBackend("admin")
  await useBackend(context)
  await signIn(page)
  await page.getByRole("link", { name: "Settings" }).first().click()
  await page.getByRole("link", { name: "Admin", exact: true }).click()
  for (const row of [
    "Event Setup",
    "Team Number",
    "Guest Access",
    "Users & Roles",
    "Announcements",
    "Live Alliance Board",
    "Data Quality",
    "Moderation",
    "Export",
    "Push Notifications",
    "Sync Health",
  ]) {
    await page.getByRole("link", { name: row }).click()
    await expect(
      page.getByRole("heading", { level: 1, name: row })
    ).toBeVisible()
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .every((a) => a.playState !== "running")
    )
    const r = await new AxeBuilder({ page })
      .exclude("[data-base-ui-focus-guard]")
      .analyze()
    expect(
      r.violations.flatMap((v) =>
        v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`)
      ),
      row
    ).toEqual([])
    await back(page)
  }
})
