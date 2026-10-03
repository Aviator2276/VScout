import { act, render, renderHook, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "konsta/react"
import { describe, expect, it, vi } from "vitest"
import { createTestRuntime } from "@/testing/data-runtime"
import { TEST_USER } from "@/testing/db"
import { toDomain } from "@/testing/factories/records"
import {
  TEST_EVENT,
  wireEventSettings,
  wirePicklist,
  wireUser,
} from "@/testing/factories/wire"
import {
  usePicklist,
  usePicklistWrites,
  usePicklists,
} from "../api/get-picklists"
import { PicklistEditor } from "../components/picklist-editor"

const OTHER = "01900000-0000-7000-8000-000000000042"

async function setup() {
  const t = createTestRuntime()
  await t.seedScope(`event:${TEST_EVENT}`, "picklist")
  return t
}

describe("picklists (scout-tab.md A)", () => {
  it("create a list, add teams in order, move one up, remove with undo", async () => {
    const t = await setup()
    const { result } = renderHook(() => usePicklistWrites(TEST_EVENT), {
      wrapper: t.wrapper,
    })
    let id = ""
    await act(async () => {
      const list = await result.current.create({
        name: "Alex 1st",
        purpose: "first",
        teams: [254, 1678, 971],
      })
      id = list.id
    })
    const detail = renderHook(() => usePicklist(TEST_EVENT, id), {
      wrapper: t.wrapper,
    })
    await vi.waitFor(() => expect(detail.result.current.status).toBe("success"))
    const rows = () =>
      detail.result.current.status === "success"
        ? detail.result.current.data.rows
        : []
    expect(rows().map((r) => r.teamNumber)).toEqual([254, 1678, 971])

    // move 971 to the top: one entry rewritten
    await act(async () => {
      await result.current.move(
        rows()[2]?.id ?? "",
        null,
        rows()[0]?.rank ?? null
      )
    })
    await vi.waitFor(() =>
      expect(rows().map((r) => r.teamNumber)).toEqual([971, 254, 1678])
    )

    let undo: () => Promise<unknown> = () => Promise.resolve()
    await act(async () => {
      const row = rows()[1]
      if (row) undo = await result.current.remove(row, id)
    })
    await vi.waitFor(() =>
      expect(rows().map((r) => r.teamNumber)).toEqual([971, 1678])
    )
    await act(async () => {
      await undo()
    })
    await vi.waitFor(() =>
      expect(rows().map((r) => r.teamNumber)).toEqual([971, 254, 1678])
    )
    // everything went through the outbox (offline OK)
    expect(await t.db.outbox.count()).toBeGreaterThan(0)
  })

  it("everyone reads every list with its owner; the followed one is pinned", async () => {
    const t = await setup()
    await t.db.users.put(
      toDomain("user", wireUser({ id: OTHER, displayName: "Sam" }))
    )
    const followed = toDomain(
      "picklist",
      wirePicklist({ ownerId: OTHER, authorId: OTHER, name: "Sam's list" })
    )
    await t.db.picklists.bulkPut([
      toDomain(
        "picklist",
        wirePicklist({ ownerId: TEST_USER, authorId: TEST_USER, name: "Mine" })
      ),
      followed,
    ])
    await t.db.eventSettings.put(
      toDomain(
        "eventSettings",
        wireEventSettings({ followedPicklistId: followed.id })
      )
    )
    const { result } = renderHook(() => usePicklists(TEST_EVENT), {
      wrapper: t.wrapper,
    })
    await vi.waitFor(() => expect(result.current.status).toBe("success"))
    const lists = result.current.status === "success" ? result.current.data : []
    expect(lists.map((l) => [l.name, l.ownerName, l.followed])).toEqual([
      ["Sam's list", "Sam", true],
      ["Mine", "You", false],
    ])
  })

  it("the editor: deleted list, read-only viewer with Copy, owner Move Up/Down", async () => {
    const onMove = vi.fn()
    const onCopy = vi.fn()
    const props = {
      chips: () => [{ label: "Auto", value: "4.1" }],
      deltas: null,
      picked: new Set([1678]),
      onMove,
      onRemove: vi.fn(),
      onReason: vi.fn(),
      onAddTeams: vi.fn(),
    }
    const { rerender } = render(
      <App theme="ios">
        <PicklistEditor
          {...props}
          state={{ status: "missing", reason: "not-found" }}
        />
      </App>
    )
    expect(screen.getByText("This picklist was deleted")).toBeInTheDocument()
    const list = toDomain("picklist", wirePicklist({ name: "Sam's" }))
    const data = (mine: boolean) => ({
      list,
      ownerName: mine ? "You" : "Sam",
      mine,
      followed: false,
      rows: [
        {
          id: "a",
          teamNumber: 254,
          nickname: "Poofs",
          rank: "a0",
          reason: "Fast",
          syncState: "synced" as const,
        },
        {
          id: "b",
          teamNumber: 1678,
          nickname: "Citrus",
          rank: "a1",
          reason: "",
          syncState: "synced" as const,
        },
      ],
    })
    rerender(
      <App theme="ios">
        <PicklistEditor
          {...props}
          onCopy={onCopy}
          state={{ status: "success", data: data(false) }}
        />
      </App>
    )
    expect(screen.queryByRole("button", { name: "Move 254 down" })).toBeNull()
    expect(screen.getByText("(picked)")).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: "Copy to My Lists" })
    )
    expect(onCopy).toHaveBeenCalled()
    rerender(
      <App theme="ios">
        <PicklistEditor
          {...props}
          state={{ status: "success", data: data(true) }}
        />
      </App>
    )
    await userEvent.click(screen.getByRole("button", { name: "Move 254 down" }))
    expect(onMove).toHaveBeenCalledWith(0, 1)
    expect(screen.getByRole("button", { name: "Move 254 up" })).toBeDisabled()
  })
})
