import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { game as rebuilt } from "@/games/2026-rebuilt/definition"
import { game } from "@/games/__fixtures__/test-game/definition"
import { formOf } from "@/games/kit/fields"
import { t } from "@/games/kit/labels"
import type { GameDefinition, ScouterLevel } from "@/games/types"
import { seqIds } from "@/testing/db"
import { ScoutingFormView } from "../components/scouting-form-view"
import { useScoutingForm } from "../hooks/use-scouting-form"
import type { EntryValues } from "../utils/form-values"

function Harness({
  g = game,
  formId = "match",
  level = "new",
  alliance = "blue",
  initial,
  onSubmit,
  onAutosave,
  startAt,
}: {
  g?: GameDefinition
  formId?: "match" | "pit" | "post"
  level?: ScouterLevel
  alliance?: "red" | "blue"
  initial?: Partial<EntryValues>
  onSubmit?: (v: EntryValues) => void
  onAutosave?: (v: EntryValues) => void
  startAt?: string
}) {
  const formDef = formOf(g, formId)
  const [ctx] = useState({ level, stage: "qual" } as const)
  const form = useScoutingForm({
    game: g,
    form: formDef,
    ctx,
    ...(initial ? { initial } : {}),
    ...(onSubmit ? { onSubmit } : {}),
    ...(onAutosave ? { onAutosave } : {}),
  })
  const [stage, setStage] = useState(startAt ?? formDef.sections[0]?.id ?? "")
  return (
    <App theme="ios">
      <ScoutingFormView
        env={{ game: g, level, alliance, ids: seqIds("0190eeee") }}
        formDef={formDef}
        ctx={ctx}
        form={form}
        stage={stage}
        onStageChange={setStage}
      />
    </App>
  )
}

const L = (key: string) => t(game, key)
const next = () => userEvent.click(screen.getByRole("button", { name: "Next" }))

describe("stage pager (ui-patterns §2.1)", () => {
  it("steps through stages, lists what's missing on Review, and submits clean data", async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    const tabs = screen.getByRole("tablist", { name: "Stages" })
    expect(within(tabs).getAllByRole("tab")).toHaveLength(4)
    expect(
      within(tabs).getByRole("tab", {
        name: `${L("phase.pre")}, step 1 of 4, complete`,
      })
    ).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByRole("button", { name: "Previous" })).toBeNull()

    await next()
    expect(
      screen.getByRole("heading", { level: 2, name: L("phase.auto") })
    ).toBeInTheDocument()
    await next()
    await next()
    await userEvent.click(screen.getByRole("button", { name: "Review" }))
    expect(
      screen.getByRole("heading", { name: "1 answer needed" })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled()
    // the stage pill now shows the problem
    expect(
      within(tabs).getByRole("tab", {
        name: new RegExp(`^${L("phase.auto")}, .*incomplete`),
      })
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(L("auto.effectiveness")) })
    )
    expect(screen.getByText("Required")).toBeInTheDocument()
    await userEvent.click(
      within(
        screen.getByRole("radiogroup", { name: L("auto.effectiveness") })
      ).getByRole("radio", {
        name: "4",
      })
    )
    await userEvent.click(
      within(tabs).getByRole("tab", { name: new RegExp(L("phase.post")) })
    )
    await userEvent.click(screen.getByRole("button", { name: "Review" }))
    expect(
      screen.getByRole("heading", { name: "Ready to submit" })
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Submit" }))
    expect(onSubmit).toHaveBeenCalledWith({
      data: { "pre.noShow": false, "auto.effectiveness": 4 },
      tags: {},
    })
  })

  it("goes back with Previous and the stepper's arrow keys", async () => {
    render(<Harness startAt="teleop" />)
    await userEvent.click(screen.getByRole("button", { name: "Previous" }))
    expect(
      screen.getByRole("heading", { level: 2, name: L("phase.auto") })
    ).toBeInTheDocument()
    screen.getByRole("tab", { selected: true }).focus()
    await userEvent.keyboard("{ArrowLeft}")
    expect(
      screen.getByRole("heading", { level: 2, name: L("phase.pre") })
    ).toBeInTheDocument()
    await userEvent.keyboard("{ArrowRight}")
    expect(
      screen.getByRole("heading", { level: 2, name: L("phase.auto") })
    ).toBeInTheDocument()
  })

  it("autosaves after a pause", async () => {
    const onAutosave = vi.fn()
    render(<Harness onAutosave={onAutosave} />)
    await userEvent.click(
      screen.getByRole("checkbox", { name: L("pre.noShow") })
    )
    await vi.waitFor(() =>
      expect(onAutosave).toHaveBeenCalledWith({
        data: expect.objectContaining({ "pre.noShow": true }) as unknown,
        tags: {},
      })
    )
  })
})

describe("descriptor rules", () => {
  it("shows fields only while their condition holds", async () => {
    render(<Harness level="experienced" startAt="teleop" />)
    const role = screen.getByRole("radiogroup", { name: L("teleop.role") })
    expect(
      screen.queryByRole("radiogroup", { name: L("teleop.widgetRating") })
    ).toBeNull()
    await userEvent.click(
      within(role).getByRole("radio", { name: L("teleop.role.offense") })
    )
    expect(
      screen.getByRole("radiogroup", { name: L("teleop.widgetRating") })
    ).toBeInTheDocument()
    await userEvent.click(
      within(role).getByRole("radio", { name: L("teleop.role.defense") })
    )
    expect(
      screen.queryByRole("radiogroup", { name: L("teleop.widgetRating") })
    ).toBeNull()
    expect(
      screen.getByRole("radiogroup", { name: L("teleop.defenseRating") })
    ).toBeInTheDocument()
    // experienced-only counter
    expect(
      screen.getByRole("group", { name: L("teleop.gizmos") })
    ).toBeInTheDocument()
  })

  it("a no-show empties the later stages, and new scouters don't see experienced fields", async () => {
    render(
      <Harness initial={{ data: { "pre.noShow": true } }} startAt="teleop" />
    )
    expect(screen.queryByRole("group", { name: L("teleop.gizmos") })).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: "Previous" }))
    expect(screen.getByText("Nothing to answer here.")).toBeInTheDocument()
  })

  it("keeps quick tags with the text field", async () => {
    const onSubmit = vi.fn()
    render(<Harness level="experienced" startAt="post" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(L("post.notes")), "Quick")
    await userEvent.click(
      screen.getByRole("button", { name: L("post.tag.fast") })
    )
    await userEvent.click(screen.getByRole("button", { name: "Review" }))
    await userEvent.click(screen.getByRole("button", { name: "Submit" }))
    expect(onSubmit).toHaveBeenCalledWith({
      data: { "pre.noShow": false, "teleop.gizmos": 0, "post.notes": "Quick" },
      tags: { "post.notes": ["fast"] },
    })
  })
})

describe("incidents (game-module.md §2.1)", () => {
  it("adds, edits and deletes a robot problem in a sheet", async () => {
    render(<Harness startAt="teleop" />)
    await userEvent.click(
      screen.getByRole("button", { name: "Robot Stopped or Broke" })
    )
    const sheet = await screen.findByRole("dialog", { name: "Robot Problem" })
    await userEvent.click(
      within(sheet).getByRole("radio", { name: L("inc.stopped") })
    )
    // the cause is pre-filled from the type
    expect(
      within(
        within(sheet).getByRole("radiogroup", { name: "Likely cause" })
      ).getByRole("radio", {
        name: L("inc.category.electrical"),
      })
    ).toHaveAttribute("aria-checked", "true")
    await userEvent.click(
      within(sheet).getByRole("radio", { name: L("inc.length.long") })
    )
    await userEvent.click(within(sheet).getByRole("button", { name: "Done" }))
    const summary = `${L("inc.stopped")} · ${L("inc.length.long")}`
    expect(
      await screen.findByRole("button", { name: summary })
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: summary }))
    const again = await screen.findByRole("dialog", { name: "Robot Problem" })
    await userEvent.click(
      within(again).getByRole("radio", { name: L("inc.length.brief") })
    )
    await act(async () => {
      await userEvent.keyboard("{Escape}")
    })
    const edited = `${L("inc.stopped")} · ${L("inc.length.brief")}`
    expect(
      await screen.findByRole("button", { name: edited })
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: `Delete ${edited}` })
    )
    expect(screen.queryByRole("button", { name: edited })).toBeNull()
  })

  it("experienced scouters get notes instead of chips for how it ended", async () => {
    render(<Harness level="experienced" startAt="teleop" />)
    await userEvent.click(
      screen.getByRole("button", { name: "Robot Stopped or Broke" })
    )
    const sheet = await screen.findByRole("dialog", { name: "Robot Problem" })
    expect(within(sheet).getByLabelText("Notes")).toBeInTheDocument()
    expect(
      within(sheet).queryByRole("radiogroup", { name: "How it ended" })
    ).toBeNull()
    expect(
      within(sheet).getByText("What happened (optional)")
    ).toBeInTheDocument()
  })
})

describe("every 2026 section renders (BETA content, any level, either alliance)", () => {
  const cases = (["match", "pit", "post"] as const).flatMap((formId) =>
    formOf(rebuilt, formId).sections.flatMap((s) =>
      (["new", "experienced"] as const).map(
        (level) => [formId, s.id, level] as const
      )
    )
  )
  it.each(cases)("%s / %s / %s", (formId, sectionId, level) => {
    const { unmount } = render(
      <Harness
        g={rebuilt}
        formId={formId}
        level={level}
        alliance="red"
        startAt={sectionId}
      />
    )
    const section = formOf(rebuilt, formId).sections.find(
      (s) => s.id === sectionId
    )
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: t(rebuilt, section?.title ?? ""),
      })
    ).toBeInTheDocument()
    unmount()
  })

  it("new scouters see help and fold detail fields; the start zone mirrors for red", () => {
    render(<Harness g={rebuilt} level="new" alliance="red" startAt="auto" />)
    expect(screen.getByText(/More Details/)).toBeInTheDocument()
    render(<Harness g={rebuilt} level="experienced" startAt="pre" />)
    const zones = screen.getAllByRole("radiogroup", {
      name: t(rebuilt, "pre.startZone"),
    })
    expect(zones[0]?.querySelector("g")?.getAttribute("transform")).toBeNull()
    render(
      <Harness g={rebuilt} level="experienced" alliance="red" startAt="pre" />
    )
    const both = screen.getAllByRole("radiogroup", {
      name: t(rebuilt, "pre.startZone"),
    })
    expect(both[1]?.querySelector("g")?.getAttribute("transform")).toMatch(
      /scale\(-1 1\)/
    )
  })
})
