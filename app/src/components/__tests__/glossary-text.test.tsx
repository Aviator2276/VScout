import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GlossaryContext } from "@/components/glossary/glossary-provider"
import type { GlossaryContextValue } from "@/components/glossary/glossary-provider"
import { GlossaryText } from "@/components/glossary/glossary-text"
import { createMatcher } from "@/lib/glossary/matcher"
import type { GlossaryTerm } from "@/types/glossary"

const terms: Array<GlossaryTerm> = [
  {
    id: "pinning",
    term: "pinning",
    short: "Trapping a robot",
    category: "strategy",
    source: "core",
  },
  {
    id: "disabled",
    term: "disabled",
    short: "Stopped moving",
    category: "robot",
    source: "core",
  },
]
const matcher = createMatcher(terms)

function mount(text: string, over: Partial<GlossaryContextValue> = {}) {
  const open = vi.fn()
  const value: GlossaryContextValue = {
    segment: matcher.segment,
    termOf: (id) => terms.find((t) => t.id === id),
    underline: "all",
    openWith: "long-press",
    open,
    ...over,
  }
  render(
    <GlossaryContext value={value}>
      <p>
        <GlossaryText>{text}</GlossaryText>
      </p>
    </GlossaryContext>
  )
  return open
}

afterEach(() => vi.useRealTimers())

describe("GlossaryText (glossary-help.md §7)", () => {
  it("underlines terms as buttons with the short definition", () => {
    mount("They were pinning and got disabled")
    const term = screen.getByRole("button", { name: "pinning" })
    expect(term).toHaveAttribute("aria-description", "Trapping a robot")
    expect(screen.getAllByRole("button")).toHaveLength(2)
  })

  it("a 500 ms press shows the definition in a tooltip; a short press or a move doesn't (FX-31)", async () => {
    vi.useFakeTimers()
    const open = mount("pinning")
    const term = screen.getByRole("button", { name: "pinning" })
    fireEvent.pointerDown(term, { button: 0, clientX: 0, clientY: 0 })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    fireEvent.pointerUp(term)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.queryByText("Trapping a robot")).not.toBeInTheDocument()
    fireEvent.pointerDown(term, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(term, { clientX: 20, clientY: 0 })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.queryByText("Trapping a robot")).not.toBeInTheDocument()
    fireEvent.pointerDown(term, { button: 0, clientX: 0, clientY: 0 })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    vi.useRealTimers()
    expect(await screen.findByText("Trapping a robot")).toBeInTheDocument()
    // the full entry is one more tap away, not forced on the user
    expect(open).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "More in Help" }))
    expect(open).toHaveBeenCalledWith("term:pinning")
  })

  it("keyboard Enter and assistive-tech clicks show it in long-press mode; a mouse click doesn't", async () => {
    mount("pinning")
    const term = screen.getByRole("button", { name: "pinning" })
    fireEvent.click(term, { detail: 1 })
    expect(screen.queryByText("Trapping a robot")).not.toBeInTheDocument()
    fireEvent.click(term, { detail: 0 })
    expect(await screen.findByText("Trapping a robot")).toBeInTheDocument()
  })

  it("tap mode shows it on a click", async () => {
    mount("pinning", { openWith: "tap" })
    fireEvent.click(screen.getByRole("button", { name: "pinning" }), {
      detail: 1,
    })
    expect(await screen.findByText("Trapping a robot")).toBeInTheDocument()
  })

  it("Off renders plain text; First per paragraph links only the first", () => {
    mount("pinning pinning", { underline: "off" })
    expect(screen.queryAllByRole("button")).toHaveLength(0)
  })

  it("First per paragraph links each term once per line", () => {
    mount("pinning, pinning\npinning", { underline: "first" })
    expect(screen.getAllByRole("button")).toHaveLength(2)
  })

  it("without a provider it is plain text with line breaks", () => {
    const { container } = render(<GlossaryText>{"a\nb"}</GlossaryText>)
    expect(container.innerHTML).toBe("a<br>b")
  })
})
