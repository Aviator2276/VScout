// Phase 3 gate (roadmap): the match and team lists and details against a synced event, in both
// engines. Criteria numbers refer to features/matches.md and features/teams.md.
import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { CREDENTIALS, MATCH_COUNT, PLAYED, mockApi } from "./fixtures/mock-api"

async function signIn(page: Page, to: string) {
  await mockApi(page)
  await page.goto(to)
  await page.getByLabel("Username").fill(CREDENTIALS.username)
  await page.getByLabel("Password").fill(CREDENTIALS.password)
  await page.getByRole("button", { name: "Sign In" }).click()
  await page.getByRole("button", { name: /Silicon Valley Regional/ }).click()
}

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
  return r.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`
  )
}

test("matches: up next, the Now divider, virtualization and search", async ({
  page,
}) => {
  await signIn(page, "/matches")
  await expect(
    page.getByRole("heading", { level: 1, name: "Matches" })
  ).toBeVisible()
  const rows = page.getByRole("list", { name: "Matches" }).getByRole("listitem")
  const upNext = rows.filter({ hasText: "Up next" })
  // criterion 1: Q34 is up next, under the Now divider, and on screen after opening
  await expect(upNext).toContainText(`Qual ${PLAYED + 2}`)
  await expect(upNext).toBeInViewport()
  await expect(
    page.getByText(`Now · Qual ${PLAYED + 1} on field`)
  ).toBeVisible()

  // criterion 13: only a window of rows is in the DOM, each with its place in the full list
  expect(await rows.count()).toBeLessThanOrEqual(30)
  await expect(rows.first()).toHaveAttribute(
    "aria-setsize",
    String(MATCH_COUNT)
  )

  // criterion 2: Jump to Now after scrolling away
  await page.evaluate(() => window.scrollTo(0, 0))
  const jump = page.getByRole("button", { name: "Jump to Now" })
  await expect(jump).toBeVisible()
  await jump.click()
  await expect(upNext).toBeInViewport()

  expect(await axe(page)).toEqual([])

  // criteria 3, 7: q12 filters at once; the URL follows with replace
  await page.getByLabel("Search matches").fill("q12")
  await expect(page.getByText("Showing: Qual 12")).toBeVisible()
  await expect(rows).toHaveCount(1)
  await expect(page).toHaveURL(/[?&]q=q12/)

  // criterion 10: chips write the URL and the Filter badge counts them
  await page.getByLabel("Search matches").fill("")
  await page.getByRole("button", { name: "Ours" }).click()
  await page.getByRole("button", { name: "Upcoming" }).click()
  await expect(page).toHaveURL(/ours=true/)
  await expect(page).toHaveURL(/status=upcoming/)
  await expect(page.getByRole("button", { name: "Filter, 2 on" })).toBeVisible()
})

test("matches: bad search values fall back (criterion 8), and a match opens", async ({
  page,
}) => {
  await signIn(page, "/matches?scouted=bogus&sort=nope")
  await expect(
    page.getByRole("heading", { level: 1, name: "Matches" })
  ).toBeVisible()
  const rows = page.getByRole("list", { name: "Matches" }).getByRole("listitem")
  await expect(rows.first()).toBeVisible()
  await page.getByLabel("Search matches").fill("q1")
  await expect(rows).toHaveCount(1)
  await expect(page).toHaveURL(/[?&]q=q1/)
  await page.getByRole("link", { name: /^Qual 1$/ }).click()
  await expect(page.getByRole("heading", { name: "Qual 1" })).toBeAttached()
  await expect(
    page.getByRole("rowgroup", { name: "Red Alliance" })
  ).toBeVisible()
  await expect(page.getByText(/Played/)).toBeVisible()
  expect(await axe(page)).toEqual([])
})

test("teams: rank order with an Unranked group, search, detail and watch", async ({
  page,
}) => {
  await signIn(page, "/teams")
  await expect(
    page.getByRole("heading", { level: 1, name: "Teams" })
  ).toBeVisible()
  const rows = page.getByRole("list", { name: "Teams" }).getByRole("listitem")
  await expect(rows.first()).toContainText("Rank 1")
  await expect(rows.first()).toContainText("The Cheesy Poofs")
  expect(await axe(page)).toEqual([])

  await page.getByLabel("Search teams").fill("cit")
  await expect(page.getByText("Best matches for ‘cit’")).toBeVisible()
  await expect(rows).toHaveCount(1)
  await expect(page).toHaveURL(/[?&]q=cit/)
  await rows.first().getByRole("link").click()

  await expect(page).toHaveURL(/\/teams\/1678/)
  // the detail chunk may still be loading under the old list: wait for the page itself, and match
  // "Watch" exactly (the list's "Watched" filter is a button too)
  await expect(
    page.getByRole("heading", { level: 1, name: "1678" })
  ).toBeVisible()
  await expect(page.getByText("Citrus Circuits")).toBeVisible()
  await page.getByRole("button", { name: "Watch", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Watch", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("radio", { name: "Matches", exact: true }).click()
  await expect(page).toHaveURL(/view=matches/)
  await expect(
    page
      .getByRole("tabpanel", { name: "Matches" })
      .getByRole("link", { name: /^Qual / })
      .first()
  ).toBeVisible()
  expect(await axe(page)).toEqual([])
})

test("teams: an unknown sort falls back to rank (criterion 5)", async ({
  page,
}) => {
  await signIn(page, "/teams?sort=retiredMetric")
  await expect(page.getByText(/Sorted by Rank/)).toBeVisible()
})

test("lists keep working offline after the first sync", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "a cold start offline needs the service worker (pwa-offline §13.2)"
  )
  await signIn(page, "/matches")
  const matchRows = page
    .getByRole("list", { name: "Matches" })
    .getByRole("listitem")
  await expect(matchRows.filter({ hasText: "Up next" })).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await context.setOffline(true)
  await page.reload()
  await expect(matchRows.filter({ hasText: "Up next" })).toBeVisible()
  await page.goto("/teams")
  await expect(
    page.getByRole("list", { name: "Teams" }).getByRole("listitem").first()
  ).toContainText("Rank 1")
})
