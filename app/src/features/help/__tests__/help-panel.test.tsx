import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import type { GlossaryTerm, GuideMeta } from "@/types/glossary"
import { HelpPanel } from "../components/help-panel"

const terms: Array<GlossaryTerm> = [
  {
    id: "auto",
    term: "Auto",
    short: "Robots run on their own",
    category: "match",
    related: ["teleop"],
    source: "core",
  },
  {
    id: "teleop",
    term: "Teleop",
    short: "Drivers control",
    category: "match",
    source: "core",
  },
  {
    id: "epa",
    term: "EPA",
    short: "Expected points",
    category: "strategy",
    source: "core",
  },
]
const guides: Array<GuideMeta> = [
  {
    id: "first",
    title: "First match",
    summary: "How to",
    audience: "new",
    load: () =>
      Promise.resolve({ default: "# First match\n\nWatch one robot." }),
  },
]

function Harness({
  initial,
  onMarkDone,
}: {
  initial: string
  onMarkDone?: (id: string) => void
}) {
  const [stack, setStack] = useState<Array<string | undefined>>([initial])
  return (
    <HelpPanel
      target={stack.at(-1)}
      terms={terms}
      guides={guides}
      onTarget={(t) => setStack((s) => [...s, t])}
      onBack={() => setStack((s) => s.slice(0, -1))}
      completedGuides={[]}
      {...(onMarkDone ? { onMarkDone } : {})}
    />
  )
}

describe("Help panel (glossary-help.md §5, §7)", () => {
  it("lists terms A–Z, filters by search and category, and shows the empty state", async () => {
    render(<Harness initial="glossary" />)
    expect(
      await screen.findByRole("dialog", { name: "Help" })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Auto/ })).toBeInTheDocument()
    await userEvent.type(screen.getByRole("searchbox"), "zzz")
    expect(screen.getByText("No terms match “zzz”")).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: "Show All Terms" })
    )
    await userEvent.click(screen.getByRole("radio", { name: "Strategy" }))
    expect(
      screen.queryByRole("button", { name: /^Auto/ })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^EPA/ })).toBeInTheDocument()
  })

  it("term detail shows related terms and Back returns", async () => {
    render(<Harness initial="term:auto" />)
    expect(
      await screen.findByText("Robots run on their own")
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /^Teleop/ }))
    expect(screen.getByRole("dialog", { name: "Teleop" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Back" }))
    expect(screen.getByRole("dialog", { name: "Auto" })).toBeInTheDocument()
  })

  it("an unknown term shows the missing state with a search action", async () => {
    render(<Harness initial="term:xyz" />)
    expect(
      await screen.findByText("“xyz” isn’t in the glossary.")
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: "Search the Glossary" })
    )
    expect(screen.getByRole("dialog", { name: "Help" })).toBeInTheDocument()
  })

  it("a guide loads its markdown and can be marked done", async () => {
    const done = vi.fn()
    render(<Harness initial="guide:first" onMarkDone={done} />)
    expect(await screen.findByText("Watch one robot.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Mark as Done" }))
    expect(done).toHaveBeenCalledWith("first")
  })
})
