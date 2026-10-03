import { act, render, renderHook, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import { describe, expect, it, vi } from "vitest"
import { dmChannelId } from "@/lib/contracts/message"
import { createTestRuntime } from "@/testing/data-runtime"
import { TEST_USER } from "@/testing/db"
import { toDomain } from "@/testing/factories/records"
import { TEST_EVENT, wireMessage, wireUser } from "@/testing/factories/wire"
import {
  dmPeer,
  useChatWrites,
  useConversations,
  useMarkRead,
  useThread,
} from "../api/get-messages"
import { REACTION_EMOJI } from "@/lib/contracts/reaction"
import type { ChatMessage } from "../api/get-messages"
import { ThreadView } from "../components/chat-views"

const SAM = "01900000-0000-7000-8000-000000000042"
const KIM = "01900000-0000-7000-8000-000000000043"
const EVENT_CH = `event:${TEST_EVENT}`

async function setup() {
  const t = createTestRuntime()
  await t.seedScope(EVENT_CH, "message")
  await t.seedScope("user", "message")
  await t.db.users.bulkPut([
    toDomain("user", wireUser({ id: SAM, displayName: "Sam" })),
    toDomain("user", wireUser({ id: KIM, displayName: "Kim" })),
  ])
  return t
}

describe("messages (scout-tab.md D)", () => {
  it("the event channel is pinned; DMs follow; unread counts use the read cursor", async () => {
    const t = await setup()
    const dm = dmChannelId(TEST_USER, SAM)
    await t.db.messages.bulkPut([
      toDomain(
        "message",
        wireMessage({
          authorId: SAM,
          channelId: EVENT_CH,
          body: "Q14 queue moved",
          createdAt: "2026-03-20T15:00:00Z",
        })
      ),
      toDomain(
        "message",
        wireMessage({
          authorId: SAM,
          channelId: dm,
          body: "Can you take 254?",
          createdAt: "2026-03-20T16:00:00Z",
        })
      ),
      // someone else's DM never shows
      toDomain(
        "message",
        wireMessage({
          authorId: SAM,
          channelId: dmChannelId(SAM, KIM),
          body: "secret",
        })
      ),
    ])
    const { result } = renderHook(
      () => ({ list: useConversations(TEST_EVENT), read: useMarkRead(dm) }),
      { wrapper: t.wrapper }
    )
    await vi.waitFor(() => expect(result.current.list.status).toBe("success"))
    const rows = () =>
      result.current.list.status === "success" ? result.current.list.data : []
    expect(rows().map((c) => [c.title, c.unread])).toEqual([
      [`#${TEST_EVENT} · Everyone`, 1],
      ["Sam", 1],
    ])
    await act(() => result.current.read(Date.parse("2026-03-20T16:00:00Z")))
    await vi.waitFor(() => expect(rows()[1]?.unread).toBe(0))
  })

  it("a DM between two others isn't available, admins included (criterion 20)", async () => {
    const t = await setup()
    t.setViewer({ userId: TEST_USER, role: "admin" })
    expect(dmPeer(dmChannelId(SAM, KIM), TEST_USER)).toBeNull()
    const { result } = renderHook(() => useThread(dmChannelId(SAM, KIM)), {
      wrapper: t.wrapper,
    })
    await vi.waitFor(() =>
      expect(result.current).toEqual({ status: "missing", reason: "forbidden" })
    )
  })

  it("sending offline queues one create op and shows Sending… (criterion 21)", async () => {
    const t = await setup()
    t.setOnline(false)
    const { result } = renderHook(
      () => ({
        thread: useThread(EVENT_CH),
        w: useChatWrites(TEST_EVENT, EVENT_CH),
      }),
      { wrapper: t.wrapper }
    )
    await act(async () => {
      await result.current.w.send("On my way")
    })
    await vi.waitFor(() => expect(result.current.thread.status).toBe("success"))
    const msgs =
      result.current.thread.status === "success"
        ? result.current.thread.data
        : []
    expect(msgs[0]).toMatchObject({
      body: "On my way",
      mine: true,
      syncState: "pending",
    })
    expect(await t.db.outbox.toArray()).toMatchObject([
      { entity: "message", kind: "create" },
    ])
  })

  it("the thread view: forbidden copy, failed message retry", async () => {
    const onRetry = vi.fn()
    const props = {
      onSend: vi.fn(() => Promise.resolve()),
      onRetry,
      onDelete: vi.fn(),
      onReact: vi.fn(),
    }
    const { rerender } = render(
      <App theme="ios">
        <ThreadView
          {...props}
          state={{ status: "missing", reason: "forbidden" }}
        />
      </App>
    )
    expect(
      screen.getByText("This conversation isn’t available")
    ).toBeInTheDocument()
    rerender(
      <App theme="ios">
        <ThreadView
          {...props}
          state={{
            status: "success",
            data: [
              {
                id: "m1",
                body: "Hi",
                authorId: TEST_USER,
                authorName: "You",
                mine: true,
                createdAt: 1,
                syncState: "rejected",
                reactions: [],
              },
            ],
          }}
        />
      </App>
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Not sent. Tap to retry." })
    )
    expect(onRetry).toHaveBeenCalledWith("m1")
  })

  describe("message actions and the composer (FX-20…FX-22)", () => {
    const msg = (o: Partial<ChatMessage> = {}): ChatMessage => ({
      id: "m1",
      body: "Q14 queue moved",
      authorId: SAM,
      authorName: "Sam",
      mine: false,
      createdAt: 1,
      syncState: "synced",
      reactions: [],
      ...o,
    })
    function renderThread(data: Array<ChatMessage>) {
      const props = {
        onSend: vi.fn(() => Promise.resolve()),
        onRetry: vi.fn(),
        onDelete: vi.fn(),
        onReact: vi.fn(),
      }
      render(
        <App theme="ios">
          <ThreadView {...props} state={{ status: "success", data }} />
        </App>
      )
      return props
    }

    it("no inline trash or add-reaction buttons under messages", () => {
      renderThread([msg({ mine: true, authorId: TEST_USER })])
      expect(
        screen.queryByRole("button", { name: "Delete message" })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole("button", { name: "Add Reaction" })
      ).not.toBeInTheDocument()
    })

    it("the ⋯ button opens actions: react (👎 included), see who reacted, delete mine", async () => {
      const props = renderThread([
        msg({
          id: "m1",
          mine: true,
          authorId: TEST_USER,
          reactions: [
            { emoji: "👍", count: 2, mineId: null, names: ["Sam", "Kim"] },
          ],
        }),
      ])
      await userEvent.click(
        screen.getByRole("button", { name: "Message actions: Q14 queue moved" })
      )
      expect(await screen.findByText("Sam, Kim")).toBeInTheDocument()
      await userEvent.click(
        screen.getByRole("button", { name: "React with 👎" })
      )
      expect(props.onReact).toHaveBeenCalledWith("m1", "👎", null)
      await userEvent.click(
        screen.getByRole("button", { name: "Message actions: Q14 queue moved" })
      )
      await userEvent.click(
        await screen.findByRole("button", { name: "Delete Message" })
      )
      expect(props.onDelete).toHaveBeenCalledWith("m1")
    })

    it("someone else's message can't be deleted", async () => {
      renderThread([msg()])
      await userEvent.click(
        screen.getByRole("button", { name: "Message actions: Q14 queue moved" })
      )
      expect(
        await screen.findByRole("button", { name: "Copy Text" })
      ).toBeInTheDocument()
      expect(
        screen.queryByRole("button", { name: "Delete Message" })
      ).not.toBeInTheDocument()
    })

    it("Enter sends; Shift+Enter adds a line", async () => {
      const props = renderThread([])
      const box = screen.getByLabelText("Message", { selector: "textarea" })
      await userEvent.type(box, "first{Shift>}{Enter}{/Shift}second{Enter}")
      expect(props.onSend).toHaveBeenCalledWith("first\nsecond")
      expect((box as HTMLTextAreaElement).value).toBe("")
    })

    it("the composer is a growing text area (new lines allowed)", async () => {
      const props = renderThread([])
      const box = screen.getByLabelText("Message", { selector: "textarea" })
      await userEvent.type(box, "line one{Shift>}{Enter}{/Shift}line two")
      expect((box as HTMLTextAreaElement).value).toBe("line one\nline two")
      await userEvent.click(screen.getByRole("button", { name: "Send" }))
      expect(props.onSend).toHaveBeenCalledWith("line one\nline two")
    })
  })

  it("👎 is an allowed reaction (contract)", () => {
    expect(REACTION_EMOJI).toContain("👎")
  })
})
