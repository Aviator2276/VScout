import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { GlossaryContext } from "@/components/glossary/glossary-provider"
import type { GlossaryContextValue } from "@/components/glossary/glossary-provider"
import { createMatcher } from "@/lib/glossary/matcher"
import { Markdown } from "../markdown"

const matcher = createMatcher([
  { id: "pin", term: "pin", short: "x", category: "strategy", source: "core" },
])
const value = {
  segment: matcher.segment,
  underline: "all",
  openWith: "long-press",
  termOf: () => undefined,
  open: () => undefined,
} as unknown as GlossaryContextValue

describe("Markdown", () => {
  it("keeps a one-paragraph body in one block, so a linked term stays inline", () => {
    const { container } = render(
      <div className="flex flex-col">
        <GlossaryContext value={value}>
          <Markdown>{"A pin longer than 3 seconds is a foul."}</Markdown>
        </GlossaryContext>
      </div>
    )
    const flex = container.firstElementChild
    expect(flex?.children).toHaveLength(1)
    const p = flex?.querySelector("p")
    expect(p?.textContent).toBe("A pin longer than 3 seconds is a foul.")
    expect(p?.querySelector('[role="button"]')?.textContent).toBe("pin")
  })
})
