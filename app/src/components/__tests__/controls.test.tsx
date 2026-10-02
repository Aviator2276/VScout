import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ChipGroup } from "../controls/chip-group"
import { CountStepper } from "../controls/count-stepper"
import { Segmented } from "../controls/segmented"
import { Switch } from "../controls/switch"
import { List, ListLinkContext } from "../list/list"

afterEach(() => vi.useRealTimers())
const ios = (ui: React.ReactNode) => render(<App theme="ios">{ui}</App>)

function SegmentedHarness() {
  const [v, setV] = useState<"offense" | "defense" | "mixed">("offense")
  return (
    <Segmented
      label="Main role"
      value={v}
      onValueChange={setV}
      options={[
        { value: "offense", label: "Offense" },
        { value: "defense", label: "Defense" },
        { value: "mixed", label: "Mixed" },
      ]}
    />
  )
}

describe("Segmented", () => {
  it("is a radiogroup with one checked radio, one tab stop and arrow keys", async () => {
    ios(<SegmentedHarness />)
    const group = screen.getByRole("radiogroup", { name: "Main role" })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Offense" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    expect(
      screen.getAllByRole("radio").filter((r) => r.tabIndex === 0)
    ).toHaveLength(1)
    await userEvent.click(screen.getByRole("radio", { name: "Defense" }))
    expect(screen.getByRole("radio", { name: "Defense" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    fireEvent.keyDown(screen.getByRole("radio", { name: "Defense" }), {
      key: "ArrowRight",
    })
    expect(screen.getByRole("radio", { name: "Mixed" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    fireEvent.keyDown(screen.getByRole("radio", { name: "Mixed" }), {
      key: "ArrowRight",
    })
    expect(screen.getByRole("radio", { name: "Offense" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
  })
})

function StepperHarness({ max = 5 }: { max?: number }) {
  const [v, setV] = useState(0)
  return <CountStepper label="fouls" value={v} onValueChange={setV} max={max} />
}

describe("CountStepper", () => {
  it("names its buttons, announces the value and respects limits", async () => {
    render(<StepperHarness max={2} />)
    expect(screen.getByRole("group", { name: "fouls" })).toBeInTheDocument()
    const dec = screen.getByRole("button", { name: "Decrease fouls" })
    const inc = screen.getByRole("button", { name: "Increase fouls" })
    expect(dec).toBeDisabled()
    await userEvent.click(inc)
    await userEvent.click(inc)
    expect(screen.getByRole("status")).toHaveTextContent("2")
    expect(inc).toBeDisabled()
    await userEvent.click(dec)
    expect(screen.getByRole("status")).toHaveTextContent("1")
  })

  it("works from the keyboard", async () => {
    render(<StepperHarness />)
    screen.getByRole("button", { name: "Increase fouls" }).focus()
    await userEvent.keyboard("{Enter}")
    expect(screen.getByRole("status")).toHaveTextContent("1")
  })

  it("repeats while held", () => {
    vi.useFakeTimers()
    render(<StepperHarness max={50} />)
    const inc = screen.getByRole("button", { name: "Increase fouls" })
    fireEvent.pointerDown(inc, { button: 0 })
    act(() => {
      vi.advanceTimersByTime(400 + 90 * 3)
    })
    fireEvent.pointerUp(inc)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByRole("status")).toHaveTextContent("5")
  })
})

describe("Switch and chips", () => {
  it("Switch is a labelled checkbox", async () => {
    const onChange = vi.fn()
    ios(<Switch label="Haptics" checked={false} onCheckedChange={onChange} />)
    await userEvent.click(screen.getByRole("checkbox", { name: "Haptics" }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it("chips are toggle buttons with aria-pressed", async () => {
    function Harness() {
      const [v, setV] = useState<Array<"fast" | "slow">>(["fast"])
      return (
        <ChipGroup
          label="Tags"
          value={v}
          onValueChange={setV}
          options={[
            { value: "fast", label: "Fast" },
            { value: "slow", label: "Slow" },
          ]}
        />
      )
    }
    render(<Harness />)
    expect(screen.getByRole("button", { name: "Fast" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await userEvent.click(screen.getByRole("button", { name: "Slow" }))
    expect(screen.getByRole("button", { name: "Slow" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.getByRole("button", { name: "Fast" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })
})

describe("List", () => {
  it("renders sections, links through the provided link renderer, and selectable rows", async () => {
    const onSelect = vi.fn()
    ios(
      <ListLinkContext
        value={(p) => (
          <a data-router="yes" href={p.href} className={p.className}>
            {p.children}
          </a>
        )}
      >
        <List.Section title="Account" footer="Signed in until Oct 8">
          <List.Row
            title="Event"
            detail="Silicon Valley"
            href="/settings/event"
          />
          <List.Row title="Layout" detail="Starter" onSelect={onSelect} />
          <List.Row title="Version" detail="2.0.0" />
          <List.Toggle
            title="Haptics"
            checked
            onCheckedChange={() => undefined}
          />
        </List.Section>
      </ListLinkContext>
    )
    expect(screen.getByText("Account")).toBeInTheDocument()
    expect(screen.getByText("Signed in until Oct 8")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Event" })).toHaveAttribute(
      "data-router",
      "yes"
    )
    await userEvent.click(screen.getByRole("button", { name: "Layout" }))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.getByRole("checkbox", { name: "Haptics" })).toBeChecked()
  })

  it("a navigating row is exactly one link (no link inside a link)", () => {
    const { container } = ios(
      <List>
        <List.Row
          title="Event"
          detail="Silicon Valley"
          href="/settings/event"
        />
      </List>
    )
    expect(container.querySelectorAll("a")).toHaveLength(1)
    expect(container.querySelectorAll("a a")).toHaveLength(0)
  })

  it("falls back to a plain link outside the app shell", () => {
    ios(
      <List>
        <List.Row title="Help" href="/help" />
      </List>
    )
    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute(
      "href",
      "/help"
    )
  })
})
