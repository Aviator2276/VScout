import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import { describe, expect, it, vi } from "vitest"
import { DemoDataView } from "../components/demo-data-view"

function mount(over: Partial<Parameters<typeof DemoDataView>[0]> = {}) {
  const props = {
    available: true,
    online: true,
    demoEvents: [{ key: "2026demo7", name: "Demo Regional #7" }],
    currentKey: "2026casj",
    initialSeed: 123,
    onCreate: vi.fn(async () => true),
    onDelete: vi.fn(async () => true),
    onOpen: vi.fn(),
    ...over,
  }
  render(
    <App theme="ios">
      <DemoDataView {...props} />
    </App>
  )
  return props
}

describe("Demo Data (AD7a)", () => {
  it("without server support it says so", () => {
    mount({ available: false })
    expect(
      screen.getByText("Demo events need server support")
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Create Demo Event" })
    ).toBeNull()
  })

  it("creates with the chosen options and the shown seed", async () => {
    const p = mount()
    await userEvent.click(screen.getByRole("radio", { name: "48" }))
    await userEvent.click(screen.getByRole("radio", { name: "Late" }))
    await userEvent.click(
      screen.getByRole("button", { name: "Create Demo Event" })
    )
    expect(p.onCreate).toHaveBeenCalledWith({
      seed: 123,
      teams: 48,
      playedPercent: 85,
      coveragePercent: 75,
    })
  })

  it("offline: Create and Delete are disabled", async () => {
    mount({ online: false })
    expect(
      screen.getByRole("button", { name: "Create Demo Event" })
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled()
  })

  it("Delete confirms, then deletes for everyone", async () => {
    const p = mount()
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete Demo Event" })
    )
    expect(p.onDelete).toHaveBeenCalledWith("2026demo7")
  })
})
