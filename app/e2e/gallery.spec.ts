// Phase 2 gate (roadmap): the gallery shows every primitive in every state, axe passes in light
// and dark, every target is at least 44 pt (56 in the scouting form), and nothing scrolls sideways
// at AX3 text. Runs against the dev server: the gallery doesn't exist in production builds.
import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { connect } from "node:net"

const PAGES = ["components", "states", "overlays", "form", "screens"] as const

async function open(page: Page, query: string) {
  await page.goto(`/dev/gallery?${query}`)
  // the dev server compiles the gallery on first visit
  await expect(
    page.getByRole("heading", { level: 1, name: "Gallery" })
  ).toBeVisible({ timeout: 30_000 })
}

async function axe(page: Page) {
  // mid-animation an overlay is partly transparent and axe measures the wrong colors
  await page.waitForFunction(() =>
    document
      .getAnimations()
      // spinners run forever; wait only for finite transitions
      .filter((a) => a.effect?.getTiming().iterations !== Infinity)
      .every((a) => a.playState !== "running")
  )
  const r = await new AxeBuilder({ page })
    // Base UI's Safari focus guards (role=button spans that keep focus inside a sheet): library
    // internals, not our markup (reported in reports/phase-2-gate.md)
    .exclude("[data-base-ui-focus-guard]")
    .analyze()
  return r.violations.flatMap((v) =>
    v.nodes.map(
      (n) =>
        `${v.id}: ${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1] ?? ""}`
    )
  )
}

/** Interactive boxes smaller than `min` (hidden inputs are measured by their label). */
async function smallTargets(page: Page, scope: string, min: number) {
  return page.evaluate(
    ({ scope: root, min: least }) => {
      const sel =
        'button, a[href], input, textarea, select, [role="button"], [role="radio"], [role="tab"], [role="checkbox"], [role="switch"]'
      const out: Array<string> = []
      for (const el of document.querySelectorAll<HTMLElement>(
        `${root} :is(${sel})`
      )) {
        if (el.closest("[aria-hidden=true], [inert]")) continue
        // inline targets in a sentence are exempt (WCAG 2.5.8): glossary words
        if (el.hasAttribute("data-inline-target")) continue
        const style = getComputedStyle(el)
        if (style.visibility === "hidden" || style.display === "none") continue
        // a native input inside a label: the label is what you tap (switches)
        const target =
          el.tagName === "INPUT" && el.closest("label")
            ? (el.closest("label") as HTMLElement)
            : el
        let box = target.getBoundingClientRect()
        if (box.width === 0 && box.height === 0) continue
        const after = getComputedStyle(target, "::after")
        // an absolutely positioned ::after over the row (List rows) makes the row the target
        if (
          after.content !== "none" &&
          after.position === "absolute" &&
          !target.matches(".hit-44, .hit-56") &&
          target.offsetParent
        )
          box = target.offsetParent.getBoundingClientRect()
        // .hit-44 / .hit-56 extend the target with an invisible ::after
        const grow =
          after.content === "none"
            ? 0
            : target.classList.contains("hit-56")
              ? 56
              : target.classList.contains("hit-44")
                ? 44
                : 0
        const w = Math.max(box.width, grow)
        const h = Math.max(box.height, grow)
        if (w + 0.5 < least || h + 0.5 < least) {
          const name =
            el.getAttribute("aria-label") ??
            (el.textContent.trim().slice(0, 30) || el.tagName)
          out.push(
            `${el.tagName.toLowerCase()} "${name}" ${Math.round(w)}×${Math.round(h)}`
          )
        }
      }
      return out
    },
    { scope, min }
  )
}

for (const theme of ["light", "dark"] as const)
  for (const show of PAGES)
    test(`axe: ${show} in ${theme}`, async ({ page }) => {
      await open(page, `show=${show}&theme=${theme}`)
      expect(await axe(page)).toEqual([])
    })

test("axe with solid surfaces, and AX3 text never scrolls sideways", async ({
  page,
}) => {
  await open(page, "show=components&theme=light&surfaces=solid")
  expect(await axe(page)).toEqual([])
  for (const show of PAGES) {
    await open(page, `show=${show}&text=ax3`)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
    expect(overflow, show).toBeLessThanOrEqual(1)
  }
  // Konsta's fixed pixel sizes must not survive: row titles and segments grow with the setting
  await open(page, "show=components&text=ax3")
  const sizes = await page.evaluate(() =>
    [
      "[role=radiogroup][aria-label=Page] [role=radio] > span",
      // the row is the link (FX-2); its title is the text-body element inside it
      "li a[href] .text-body",
    ].map((sel) =>
      parseFloat(
        getComputedStyle(document.querySelector(sel) as Element).fontSize
      )
    )
  )
  for (const size of sizes) expect(size).toBeGreaterThan(30)
})

test("every overlay is labelled and passes axe while open", async ({
  page,
}) => {
  await open(page, "show=overlays&theme=light")
  for (const [button, role, name] of [
    ["Open Sheet", "dialog", "Edit Widget"],
    ["Open Glass Sheet", "dialog", "Edit Widget"],
    ["Open Large Sheet", "dialog", "Filters"],
    ["Open Action Sheet", "dialog", "Delete this entry?"],
    ["Open Alert", "alertdialog", "Sign out anyway?"],
  ] as const) {
    await page.getByRole("button", { name: button }).click()
    await expect(page.getByRole(role, { name })).toBeVisible()
    expect(await axe(page), button).toEqual([])
    await page.keyboard.press("Escape")
    await expect(page.getByRole(role, { name })).toBeHidden()
  }
  await page.getByRole("button", { name: "Show Toast" }).click()
  await expect(page.getByText("Entry deleted")).toBeVisible()
  expect(await axe(page)).toEqual([])
})

test("touch targets: 44 pt everywhere, 56 pt in the scouting form", async ({
  page,
}) => {
  for (const show of ["components", "screens"]) {
    await open(page, `show=${show}`)
    expect(await smallTargets(page, "main", 44), show).toEqual([])
  }
  await open(page, "show=form")
  // the stage bar and form fields; the level switch above the form is ordinary UI
  expect(await smallTargets(page, "[role=tabpanel]", 56)).toEqual([])
  expect(
    await smallTargets(page, 'nav[aria-label="Stage navigation"]', 56)
  ).toEqual([])
})

const brokerUp = () =>
  new Promise<boolean>((resolve) => {
    const s = connect(9001, "localhost")
    s.once("connect", () => {
      s.destroy()
      resolve(true)
    })
    s.once("error", () => resolve(false))
  })

test("mqtt.js keeps binary correlationData in the browser bundle", async ({
  page,
}) => {
  test.skip(!(await brokerUp()), "dev broker not running (pnpm stack:up)")
  await open(page, "show=mqtt")
  await page.getByRole("button", { name: "Run Probe" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: /survive|failed/ })
  ).toHaveText("Binary properties survive.", { timeout: 10_000 })
})
