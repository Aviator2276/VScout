import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { ChoiceChips } from "../controls/choice-chips"
import { StageStepper } from "../controls/stage-stepper"
import { ZoneMap } from "../controls/zone-map"

const zones = [
  {
    id: "left",
    label: "Left",
    polygon: [
      [0, 0],
      [0.5, 0],
      [0.5, 1],
      [0, 1],
    ] as const,
  },
  {
    id: "right",
    label: "Right",
    polygon: [
      [0.5, 0],
      [1, 0],
      [1, 1],
      [0.5, 1],
    ] as const,
  },
]
const image = { src: "/field.svg", width: 200, height: 100, alt: "Field" }

function MapHarness({ mirror = false }: { mirror?: boolean }) {
  const [v, setV] = useState<string | null>(null)
  return (
    <ZoneMap
      label="Start zone"
      image={image}
      zones={zones}
      value={v}
      onValueChange={setV}
      mirror={mirror}
    />
  )
}

describe("ZoneMap", () => {
  it("is a radiogroup of large zone chips; the drawing is a tap shortcut", async () => {
    const { container } = render(<MapHarness />)
    const group = screen.getByRole("radiogroup", { name: "Start zone" })
    await userEvent.click(within(group).getByRole("radio", { name: "Left" }))
    expect(within(group).getByRole("radio", { name: "Left" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    const right = container.querySelector('polygon[data-zone="right"]')
    expect(right?.getAttribute("points")).toBe("100,0 200,0 200,100 100,100")
    fireEvent.click(right as Element)
    expect(within(group).getByRole("radio", { name: "Right" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true"
    )
    expect(container.querySelector("g")?.getAttribute("transform")).toBeNull()
  })

  it("flips for the red alliance", () => {
    const { container } = render(<MapHarness mirror />)
    expect(container.querySelector("g")?.getAttribute("transform")).toBe(
      "translate(200 0) scale(-1 1)"
    )
  })
})

describe("ChoiceChips", () => {
  it("picks one with a check mark and moves with arrow keys", async () => {
    const onChange = vi.fn()
    function Harness() {
      const [v, setV] = useState<"a" | "b" | "c" | null>(null)
      return (
        <ChoiceChips
          label="Type"
          options={[
            { value: "a", label: "Alpha" },
            { value: "b", label: "Bravo" },
            { value: "c", label: "Charlie" },
          ]}
          value={v}
          onValueChange={(x) => {
            onChange(x)
            setV(x)
          }}
        />
      )
    }
    render(<Harness />)
    const alpha = screen.getByRole("radio", { name: "Alpha" })
    expect(alpha).toHaveAttribute("tabindex", "0")
    await userEvent.click(screen.getByRole("radio", { name: "Bravo" }))
    expect(screen.getByRole("radio", { name: "Bravo" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    fireEvent.keyDown(screen.getByRole("radio", { name: "Bravo" }), {
      key: "ArrowDown",
    })
    fireEvent.keyDown(screen.getByRole("radio", { name: "Charlie" }), {
      key: "ArrowRight",
    })
    fireEvent.keyDown(screen.getByRole("radio", { name: "Alpha" }), {
      key: "ArrowUp",
    })
    expect(onChange.mock.calls.map((c) => c[0] as string)).toEqual([
      "b",
      "c",
      "a",
      "c",
    ])
  })
})

describe("StageStepper", () => {
  it("names each tab with its position and status", async () => {
    const onSelect = vi.fn()
    render(
      <StageStepper
        label="Stages"
        steps={[
          { id: "pre", label: "Pre", status: "done" },
          { id: "auto", label: "Auto", status: "issue" },
          { id: "teleop", label: "Teleop", status: "todo" },
        ]}
        current="teleop"
        onSelect={onSelect}
      />
    )
    expect(
      screen.getByRole("tab", { name: "Pre, step 1 of 3, complete" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("tab", { name: "Auto, step 2 of 3, incomplete" })
    ).toBeInTheDocument()
    const current = screen.getByRole("tab", {
      name: "Teleop, step 3 of 3, not started",
    })
    expect(current).toHaveAttribute("aria-selected", "true")
    fireEvent.keyDown(current, { key: "ArrowRight" })
    expect(onSelect).toHaveBeenLastCalledWith("pre")
    await userEvent.click(screen.getByRole("tab", { name: /^Auto/ }))
    expect(onSelect).toHaveBeenLastCalledWith("auto")
  })
})
