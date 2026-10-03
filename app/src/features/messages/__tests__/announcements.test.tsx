import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import { describe, expect, it, vi } from "vitest"
import { createTestRuntime } from "@/testing/data-runtime"
import { TEST_USER } from "@/testing/db"
import { toDomain } from "@/testing/factories/records"
import { TEST_EVENT, wireMessage, wireUser } from "@/testing/factories/wire"
import {
  useAckedAnnouncements,
  useAnnouncements,
  useToggleReaction,
} from "../api/get-announcements"
import { AnnouncementsView } from "../components/announcements-view"

const ADMIN = "01900000-0000-7000-8000-000000000001"

function Screen({ react = true }: { react?: boolean }) {
  const state = useAnnouncements(TEST_EVENT)
  const { acked, acknowledge } = useAckedAnnouncements()
  const toggle = useToggleReaction(TEST_EVENT)
  return (
    <AnnouncementsView
      state={state}
      acked={acked}
      onAcknowledge={(id) => void acknowledge(id)}
      onReact={react ? (id, e, mine) => void toggle(id, e, mine) : null}
    />
  )
}

async function setup(role: "guest" | "scouter" = "guest") {
  const t = createTestRuntime({ viewer: { userId: TEST_USER, role } })
  await t.seedScope(`event:${TEST_EVENT}`, "message")
  await t.db.users.put(
    toDomain(
      "user",
      wireUser({ id: ADMIN, displayName: "Coach Kim", role: "admin" })
    )
  )
  await t.db.messages.bulkPut([
    toDomain(
      "message",
      wireMessage({
        authorId: ADMIN,
        kind: "announcement",
        body: "Lunch until 1:15",
        priority: "urgent",
        createdAt: "2026-03-20T15:00:00Z",
      })
    ),
    toDomain(
      "message",
      wireMessage({
        authorId: ADMIN,
        kind: "announcement",
        body: "Pit inspection done",
        createdAt: "2026-03-20T16:00:00Z",
      })
    ),
    toDomain(
      "message",
      wireMessage({ authorId: ADMIN, body: "chat, not an announcement" })
    ),
  ])
  return t
}

describe("announcements (scout-tab.md D3)", () => {
  it("empty and loading states", async () => {
    render(
      <App theme="ios">
        <AnnouncementsView
          state={{ status: "empty" }}
          acked={new Set()}
          onAcknowledge={vi.fn()}
          onReact={null}
        />
      </App>
    )
    expect(screen.getByText("No announcements yet")).toBeInTheDocument()
  })

  it("pins an unacknowledged urgent one on top until Got It", async () => {
    const t = await setup()
    render(
      <App theme="ios">
        <t.wrapper>
          <Screen />
        </t.wrapper>
      </App>
    )
    const cards = await screen.findAllByRole("article")
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveTextContent("Lunch until 1:15")
    expect(cards[0]).toHaveTextContent("Coach Kim")
    expect(screen.queryByText("chat, not an announcement")).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: "Got It" }))
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: "Got It" })).toBeNull()
    )
    const after = screen.getAllByRole("article")
    expect(after[0]).toHaveTextContent("Pit inspection done")
  })

  it("a guest reacts and un-reacts: a create op, then the create is cancelled (criterion 19a)", async () => {
    const t = await setup("guest")
    render(
      <App theme="ios">
        <t.wrapper>
          <Screen />
        </t.wrapper>
      </App>
    )
    const card = (await screen.findAllByRole("article"))[1] as HTMLElement
    await userEvent.click(
      within(card).getByRole("button", { name: "Add Reaction" })
    )
    await userEvent.click(
      within(card).getByRole("button", { name: "React with 👍" })
    )
    const chip = await within(card).findByRole("button", { name: /👍 1/ })
    expect(chip).toHaveAttribute("aria-pressed", "true")
    const ops = await t.db.outbox.toArray()
    expect(ops).toMatchObject([{ entity: "reaction", kind: "create" }])
    const reaction = await t.db.reactions.toArray()
    expect(reaction[0]).toMatchObject({
      targetType: "announcement",
      emoji: "👍",
    })

    await userEvent.click(chip)
    await vi.waitFor(() =>
      expect(within(card).queryByRole("button", { name: /👍 1/ })).toBeNull()
    )
    // the server never saw the create, so the delete just drops it
    expect(await t.db.outbox.count()).toBe(0)
  })

  it("hides the reaction bar without the reactions capability", async () => {
    const t = await setup()
    render(
      <App theme="ios">
        <t.wrapper>
          <Screen react={false} />
        </t.wrapper>
      </App>
    )
    await screen.findAllByRole("article")
    expect(screen.queryByRole("button", { name: "Add Reaction" })).toBeNull()
  })
})
