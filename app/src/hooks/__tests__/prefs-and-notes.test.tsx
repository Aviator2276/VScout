import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { createTestRuntime } from "@/testing/data-runtime"
import { TEST_USER } from "@/testing/db"
import { toDomain } from "@/testing/factories/records"
import { TEST_EVENT, wireComment, wireUser } from "@/testing/factories/wire"
import { useNotes } from "../use-notes"
import { usePrefs, useSetPrefs, useWatchedTeams } from "../use-prefs"

const OTHER = "01900000-0000-7000-8000-000000000042"

describe("preferences (ADR-033, ADR-066)", () => {
  it("a scouter's change is a userSettings patch through the outbox (teams.md criterion 9)", async () => {
    const t = createTestRuntime()
    const { result } = renderHook(
      () => ({ prefs: usePrefs(), set: useSetPrefs() }),
      { wrapper: t.wrapper }
    )
    await act(() => result.current.set({ teamListColumns: ["a", "b", "c"] }))
    await vi.waitFor(() =>
      expect(result.current.prefs.teamListColumns).toEqual(["a", "b", "c"])
    )
    const ops = await t.db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({
      entity: "userSettings",
      recordId: TEST_USER,
      patchKeys: ["teamListColumns"],
    })
  })

  it("a guest's change stays on the device: no outbox op", async () => {
    const t = createTestRuntime({
      viewer: { userId: TEST_USER, role: "guest" },
    })
    const { result } = renderHook(
      () => ({ prefs: usePrefs(), set: useSetPrefs() }),
      { wrapper: t.wrapper }
    )
    await act(() => result.current.set({ teamListColumns: ["x", "y"] }))
    await vi.waitFor(() =>
      expect(result.current.prefs.teamListColumns).toEqual(["x", "y"])
    )
    expect(await t.db.outbox.count()).toBe(0)
    expect((await t.db.deviceSettings.get("device"))?.guestPrefs).toMatchObject(
      {
        teamListColumns: ["x", "y"],
      }
    )
  })

  it("watch and unwatch toggle the same team", async () => {
    const t = createTestRuntime()
    const { result } = renderHook(() => useWatchedTeams(), {
      wrapper: t.wrapper,
    })
    await act(() => result.current.toggle(254))
    await vi.waitFor(() => expect(result.current.watched.has(254)).toBe(true))
    await act(() => result.current.toggle(254))
    await vi.waitFor(() => expect(result.current.watched.has(254)).toBe(false))
    // two edits to one document coalesce into one op
    expect(await t.db.outbox.count()).toBe(1)
  })
})

describe("useNotes (ADR-040)", () => {
  it("shows my private notes to me only, with author names, newest first (teams.md criterion 13)", async () => {
    const t = createTestRuntime()
    await t.seedScope(`event:${TEST_EVENT}`, "comment")
    await t.db.users.bulkPut([
      toDomain("user", wireUser({ id: OTHER, displayName: "Sam" })),
    ])
    await t.db.comments.bulkPut([
      toDomain(
        "comment",
        wireComment({
          body: "Team note",
          authorId: OTHER,
          createdAt: "2026-03-20T15:00:00Z",
        })
      ),
      toDomain(
        "comment",
        wireComment({
          body: "Sam's private",
          authorId: OTHER,
          visibility: "private",
        })
      ),
      toDomain(
        "comment",
        wireComment({
          body: "My private",
          authorId: TEST_USER,
          visibility: "private",
          createdAt: "2026-03-20T16:00:00Z",
        })
      ),
    ])
    const { result } = renderHook(
      () => useNotes({ eventKey: TEST_EVENT, teamNumber: 254 }),
      { wrapper: t.wrapper }
    )
    await vi.waitFor(() => expect(result.current.status).toBe("success"))
    const notes = result.current.status === "success" ? result.current.data : []
    expect(notes.map((n) => [n.body, n.authorName, n.private])).toEqual([
      ["My private", "You", true],
      ["Team note", "Sam", false],
    ])

    // an admin doesn't see someone else's private note either
    act(() =>
      t.setViewer({
        userId: "01900000-0000-7000-8000-000000000099",
        role: "admin",
      })
    )
    await vi.waitFor(() => {
      const s = result.current
      expect(s.status === "success" && s.data.map((n) => n.body)).toEqual([
        "Team note",
      ])
    })
  })
})
