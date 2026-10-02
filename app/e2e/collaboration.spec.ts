// Phase 5 gate (roadmap): e2e coverage of each strategy and collaboration flow, against the
// stateful mock backend. Push needs real devices (see the gate report).
import { expect, test } from "@playwright/test"
import type { Browser, BrowserContext, Page } from "@playwright/test"
import {
  CREDENTIALS,
  seedBackend,
  seedBoard,
  serverRecords,
  useBackend,
} from "./fixtures/backend"

async function signIn(page: Page, to = "/scout") {
  await page.goto(to)
  const username = page.getByLabel("Username")
  const event = page.getByRole("button", { name: /Silicon Valley Regional/ })
  await expect(username.or(event)).toBeVisible()
  if (await username.isVisible()) {
    await username.fill(CREDENTIALS.username)
    await page.getByLabel("Password").fill(CREDENTIALS.password)
    await page.getByRole("button", { name: "Sign In" }).click()
  }
  await event.click()
}

async function syncNow(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("online")))
}

async function twoDevices(browser: Browser) {
  const contexts: Array<BrowserContext> = [
    await browser.newContext(),
    await browser.newContext(),
  ]
  const devices = await Promise.all(contexts.map((c) => useBackend(c)))
  const pages = await Promise.all(contexts.map((c) => c.newPage()))
  return { contexts, devices, pages }
}

test("picklists: create, add teams, reorder; another device reads it with the owner's name", async ({
  browser,
}) => {
  test.setTimeout(90_000)
  seedBackend()
  const { contexts, pages } = await twoDevices(browser)
  const [a, b] = pages
  if (!a || !b) throw new Error("no pages")
  await signIn(a, "/scout")
  await a.getByRole("link", { name: "Picklists" }).click()
  await a.getByRole("button", { name: "New Picklist" }).click()
  await a.getByLabel("Name").fill("Alex 1st")
  await a.getByRole("button", { name: "Create Picklist" }).click()
  await expect(a.getByText("No teams yet")).toBeVisible()
  await a.getByRole("button", { name: "Add Teams" }).click()
  const sheet = a.getByRole("dialog", { name: "Add Teams" })
  await sheet.getByRole("button", { name: /^254/ }).click()
  await sheet.getByRole("button", { name: /^1678/ }).click()
  await sheet.getByRole("button", { name: "Add 2 Teams" }).click()
  const rows = a
    .getByRole("list", { name: /Alex 1st, in order/ })
    .getByRole("listitem")
  await expect(rows).toHaveCount(2)
  await a.getByRole("button", { name: "Move 1678 up" }).click()
  await expect(rows.first()).toContainText("1678")
  await expect.poll(() => serverRecords("picklistEntry").length).toBe(2)

  await signIn(b, "/scout")
  await syncNow(b)
  await b.getByRole("link", { name: "Picklists" }).click()
  const list = b.getByRole("list", { name: "Picklists" })
  await expect(list).toContainText("Alex 1st")
  await expect(list).toContainText("You")
  for (const c of contexts) await c.close()
})

test("live alliance board: record a pick, another device sees it, offline can't record", async ({
  browser,
}) => {
  test.setTimeout(90_000)
  seedBackend()
  seedBoard()
  const { contexts, devices, pages } = await twoDevices(browser)
  const [a, b] = pages
  if (!a || !b) throw new Error("no pages")
  await signIn(a, "/scout")
  await a.getByRole("link", { name: "Alliance Selection" }).click()
  await expect(a.getByText("Round 1 · Alliance 1 picking")).toBeVisible()
  await a.getByRole("button", { name: "Record Pick", exact: true }).click()
  const sheet = a.getByRole("dialog", { name: "Alliance 1" })
  await sheet.getByRole("button", { name: /^3000/ }).click()
  await sheet
    .getByRole("button", { name: "Record 3000 for Alliance 1" })
    .click()
  await expect(a.getByRole("listitem", { name: "Alliance 1" })).toContainText(
    "3000"
  )
  await expect(a.getByText("Round 1 · Alliance 2 picking")).toBeVisible()

  await signIn(b, "/scout")
  await syncNow(b)
  await b.getByRole("link", { name: "Alliance Selection" }).click()
  await expect(b.getByRole("listitem", { name: "Alliance 1" })).toContainText(
    "3000"
  )

  await devices[1]?.setOffline(true)
  await expect(
    b.getByRole("button", { name: "Record Pick", exact: true })
  ).toBeDisabled()
  await expect(b.getByText("Connect to record picks")).toBeVisible()
  for (const c of contexts) await c.close()
})

test("chat: a message sent on one device arrives on the other", async ({
  browser,
}) => {
  test.setTimeout(90_000)
  seedBackend()
  const { contexts, pages } = await twoDevices(browser)
  const [a, b] = pages
  if (!a || !b) throw new Error("no pages")
  await signIn(a, "/scout")
  await a.getByRole("link", { name: "Messages" }).click()
  await expect(
    a.getByRole("heading", { level: 1, name: "Messages" })
  ).toBeVisible()
  // the notifications pre-prompt may open on the first visit (push-notifications.md §2.2)
  const notNow = a.getByRole("button", { name: "Not Now" })
  await notNow.waitFor({ timeout: 1500 }).then(
    () => notNow.click(),
    () => undefined
  )
  await a.getByRole("link", { name: /Everyone/ }).click()
  await expect(a.getByLabel("Message", { exact: true })).toBeVisible()
  await a
    .getByLabel("Message", { exact: true })
    .fill("Q14 queue moved to field 2")
  await a.getByRole("button", { name: "Send" }).click()
  await expect(a.getByRole("list", { name: "Messages" })).toContainText(
    "Q14 queue moved"
  )
  await expect.poll(() => serverRecords("message").length).toBe(1)

  await signIn(b, "/scout")
  await syncNow(b)
  await b.getByRole("link", { name: "Messages" }).click()
  await expect(b.getByRole("list", { name: "Conversations" })).toContainText(
    "Q14 queue moved"
  )
  for (const c of contexts) await c.close()
})

test("strategy: a briefing lists opponents first, with the game's sections", async ({
  page,
  context,
}) => {
  seedBackend()
  await useBackend(context)
  await signIn(page, "/scout")
  // the Needs Scouting card grows once it loads; let it settle before tapping below it
  await expect(
    page.getByRole("button", { name: /^Start Scouting/ })
  ).toBeVisible()
  await page.getByRole("link", { name: "Strategy" }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Strategy" })
  ).toBeVisible()
  await page.getByRole("main").getByRole("link").first().click()
  await expect(page.getByRole("article").first()).toBeVisible()
  expect(await page.getByRole("article").count()).toBe(6)
})

test("guests: no Messages row, and the messages page says no access", async ({
  page,
  context,
}) => {
  seedBackend("guest")
  await useBackend(context)
  await page.goto("/login")
  await page.getByRole("button", { name: "Continue as Guest" }).click()
  await page.getByLabel(/code/i).fill("K7M2QX")
  await expect(
    page.getByRole("heading", { level: 1, name: "Home" })
  ).toBeVisible()
  await page
    .getByRole("navigation", { name: "Tabs" })
    .getByRole("link", { name: "Scout" })
    .click()
  await expect(page.getByRole("link", { name: "Picklists" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Messages" })).toHaveCount(0)
  await page.evaluate(() => {
    history.pushState({}, "", "/scout/messages")
    dispatchEvent(new PopStateEvent("popstate"))
  })
  await expect(
    page.getByText("You don't have access", { exact: false })
  ).toBeVisible()
})
