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
})
