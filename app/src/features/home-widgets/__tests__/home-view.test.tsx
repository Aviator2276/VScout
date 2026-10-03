import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import type { Placed } from "@/components/grid/grid-engine"
import { ToastProvider } from "@/components/overlays/toaster"
import { widgetSetting } from "@/config/widget-catalog"
import { createTestRuntime } from "@/testing/data-runtime"
import { TEST_USER } from "@/testing/db"
import type { WidgetRole } from "@/types/widget"
import { HomeView } from "../components/home-view"
import type { HomeViewProps } from "../components/home-view"
import { templateList } from "../utils/templates"

let n = 0
function Harness({ role }: { role: WidgetRole }) {
  const [editing, setEditing] = useState(false)
  const [sheet, setSheet] = useState<HomeViewProps["sheet"]>()
  const [id, setId] = useState<string>()
  return (
    <HomeView
      role={role}
      editing={editing}
      onEditingChange={(e, then) => {
        setEditing(e)
        if (then) {
          setSheet(then.sheet)
          setId(then.id)
        }
      }}
      sheet={sheet}
      sheetId={id}
      onSheet={(s, i) => {
        setSheet(s)
        setId(i)
      }}
      renderWidget={(item: Placed) => <p data-testid="widget">{item.widget}</p>}
      newId={() => `new-${++n}`}
    />
  )
}

function mount(role: WidgetRole = "scouter") {
  const t = createTestRuntime({ viewer: { userId: TEST_USER, role } })
  render(
    <App theme="ios">
      <ToastProvider>
        <t.wrapper>
          <Harness role={role} />
        </t.wrapper>
      </ToastProvider>
    </App>
  )
  return t
}

const widgets = () => screen.getAllByTestId("widget").map((e) => e.textContent)

describe("Home (features/home.md)", () => {
  it("no saved layout: the Starter renders with the tip and the Layout control (criterion 1)", async () => {
    mount()
    await vi.waitFor(() =>
      expect(widgets()).toEqual([
        "ourNextMatch",
        "needsScouting",
        "clock",
        "announcements",
        "resumeDrafts",
        "rankings",
      ])
    )
    expect(screen.getByText(/This is the Starter layout/)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Layout, Starter" })
    ).toBeInTheDocument()
  })

  it("a guest's Starter skips scouting widgets (criterion 2)", () => {
    expect(
      templateList("starter", "compact", "guest").map((i) => i.widget)
    ).toEqual(["ourNextMatch", "clock", "announcements", "rankings"])
  })

  it("editing forks the template into Custom; Done writes one homeLayout patch (criteria 4, 12, 18)", async () => {
    const t = mount()
    await vi.waitFor(() => expect(widgets()).toHaveLength(6))
    await userEvent.click(screen.getByRole("button", { name: "Edit Home" }))
    await userEvent.click(
      screen.getByRole("button", { name: /^Edit Clock, 2 by 2/ })
    )
    const sheet = screen.getByRole("dialog", { name: "Clock" })
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Move to Top" })
    )
    expect(within(sheet).getByText("Position 1 of 6")).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole("button", { name: "Done" }))
    await userEvent.click(screen.getByRole("button", { name: "Done" }))
    await vi.waitFor(async () => expect(await t.db.outbox.count()).toBe(1))
    const [op] = await t.db.outbox.toArray()
    expect(op).toMatchObject({
      entity: "userSettings",
      patchKeys: ["homeLayout"],
    })
    const stored = (await t.db.userSettings.get(TEST_USER))?.homeLayout as {
      active: unknown
      custom: { compact: Array<{ widget: string }> }
    }
    expect(stored.active).toEqual({ kind: "custom" })
    expect(stored.custom.compact[0]?.widget).toBe("clock")
    await vi.waitFor(() => expect(widgets()[0]).toBe("clock"))
    expect(
      screen.getByRole("button", { name: "Layout, Custom" })
    ).toBeInTheDocument()
  })

  it("the widget menu (long press / right-click) opens Widget Settings; settings and color sync on every screen size (owner)", async () => {
    const t = mount()
    await vi.waitFor(() => expect(widgets()).toHaveLength(6))
    const clock = screen
      .getAllByTestId("widget")
      .find((e) => e.textContent === "clock")
    if (!clock) throw new Error("no clock")
    fireEvent.contextMenu(clock)
    const menu = await screen.findByRole("dialog", { name: "Clock" })
    await userEvent.click(
      within(menu).getByRole("button", { name: "Widget Settings" })
    )
    const sheet = await screen.findByRole("dialog", { name: "Clock" })
    await userEvent.click(
      within(sheet).getByRole("checkbox", { name: "Show Seconds" })
    )
    await userEvent.click(within(sheet).getByRole("radio", { name: "Blue" }))
    expect(within(sheet).getByRole("radio", { name: "Blue" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await userEvent.click(within(sheet).getByRole("button", { name: "Done" }))
    await userEvent.click(screen.getByRole("button", { name: "Done" }))
    await vi.waitFor(async () => expect(await t.db.outbox.count()).toBe(1))
    const stored = (await t.db.userSettings.get(TEST_USER))?.homeLayout as {
      custom: Record<
        string,
        Array<{ widget: string; color?: string; config?: object }>
      >
    }
    for (const list of Object.values(stored.custom)) {
      const c = list.find((i) => i.widget === "clock")
      expect(c).toMatchObject({ color: "blue", config: { seconds: true } })
    }
  })

  it("widget settings fall back to the catalog defaults and clamp counts", () => {
    expect(widgetSetting("clock", undefined, "showDay")).toBe(true)
    expect(widgetSetting("clock", { seconds: "yes" }, "seconds")).toBe(false)
    expect(widgetSetting("rankings", { rows: 999 }, "rows")).toBe(24)
    expect(widgetSetting("rankings", { rows: 1 }, "rows")).toBe(3)
    expect(widgetSetting("clock", {}, "nope")).toBeUndefined()
  })

  it("remove offers Undo; a guest's layout stays on the device", async () => {
    const t = mount("guest")
    await vi.waitFor(() => expect(widgets()).toHaveLength(4))
    await userEvent.click(screen.getByRole("button", { name: "Edit Home" }))
    await userEvent.click(screen.getByRole("button", { name: "Remove Clock" }))
    expect(widgets()).not.toContain("clock")
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }))
    await vi.waitFor(() => expect(widgets()).toContain("clock"))
    await userEvent.click(screen.getByRole("button", { name: "Done" }))
    await vi.waitFor(async () =>
      expect(
        (await t.db.deviceSettings.get("device"))?.guestPrefs
      ).toHaveProperty("homeLayout")
    )
    expect(await t.db.outbox.count()).toBe(0)
  })

  it("an unknown widget asks for an update; a widget for another role is locked (criterion 21)", async () => {
    const t = createTestRuntime({
      viewer: { userId: TEST_USER, role: "guest" },
    })
    await t.db.deviceSettings.put({
      id: "device",
      solidSurfaces: false,
      haptics: true,
      iosHapticsExperiment: false,
      keepScreenAwake: false,
      autoDownloadVideos: false,
      transport: "auto",
      guestPrefs: {
        homeLayout: {
          v: 2,
          active: { kind: "custom" },
          custom: {
            compact: [
              { id: "a", widget: "futureThing", w: 2, h: 2 },
              { id: "b", widget: "needsScouting", w: 4, h: 2 },
            ],
          },
        },
      },
    })
    render(
      <App theme="ios">
        <ToastProvider>
          <t.wrapper>
            <Harness role="guest" />
          </t.wrapper>
        </ToastProvider>
      </App>
    )
    expect(
      await screen.findByText("Update the app to see this widget")
    ).toBeInTheDocument()
    expect(screen.getByText("Not available for your role")).toBeInTheDocument()
  })
})
