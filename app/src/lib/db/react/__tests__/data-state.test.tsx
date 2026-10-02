import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { createTestRuntime } from "@/testing/data-runtime"
import { useCollectionState, useRecordState } from "../data-state-hooks"

const EV = "event:2026casj"
const match = (n: number) =>
  ({ key: `2026casj_qm${n}`, eventKey: "2026casj", rev: 1 }) as never

describe("useCollectionState (data-layer §9.2.2)", () => {
  function useMatches(
    t: ReturnType<typeof createTestRuntime>,
    o: { enabled?: boolean; allowed?: boolean; fail?: boolean } = {}
  ) {
    return useCollectionState({
      enabled: o.enabled ?? true,
      allowed: o.allowed ?? true,
      source: { scope: EV, entity: "match" },
      deps: [o.fail],
      query: async () => {
        if (o.fail) throw new Error("boom")
        return t.db.matches.where("eventKey").equals("2026casj").toArray()
      },
    })
  }

  it("is idle without its input and forbidden when the role can't read", () => {
    const t = createTestRuntime()
    expect(
      renderHook(() => useMatches(t, { enabled: false }), {
        wrapper: t.wrapper,
      }).result.current
    ).toEqual({ status: "idle" })
    expect(
      renderHook(() => useMatches(t, { allowed: false }), {
        wrapper: t.wrapper,
      }).result.current
    ).toEqual({
      status: "missing",
      reason: "forbidden",
    })
  })

  it("is forbidden when the server refused the scope", async () => {
    const t = createTestRuntime()
    await t.seedScope(EV, "match", { forbidden: true })
    const { result } = renderHook(() => useMatches(t), { wrapper: t.wrapper })
    expect(result.current).toEqual({ status: "missing", reason: "forbidden" })
  })

  it("starts loading, then empty after a finished bootstrap", async () => {
    const t = createTestRuntime()
    await t.seedScope(EV, "match")
    const { result } = renderHook(() => useMatches(t), { wrapper: t.wrapper })
    expect(result.current).toEqual({ status: "loading" })
    await waitFor(() => expect(result.current).toEqual({ status: "empty" }))
  })

  it("never synced: loading while it can sync, not-synced while offline (ADR-045)", async () => {
    const t = createTestRuntime()
    const { result } = renderHook(() => useMatches(t), { wrapper: t.wrapper })
    await waitFor(() => expect(result.current).toEqual({ status: "loading" }))
    t.setOnline(false)
    await waitFor(() =>
      expect(result.current).toEqual({
        status: "missing",
        reason: "not-synced",
      })
    )
  })

  it("shows partial data as stale mid-bootstrap, fresh once done", async () => {
    const t = createTestRuntime()
    await t.seedScope(EV, "match", { bootstrapState: "running" })
    await t.db.matches.put(match(1))
    const { result } = renderHook(() => useMatches(t), { wrapper: t.wrapper })
    await waitFor(() =>
      expect(result.current).toMatchObject({ status: "success", stale: true })
    )
    await t.seedScope(EV, "match")
    await waitFor(() =>
      expect(result.current).toEqual({ status: "success", data: [match(1)] })
    )
  })

  it("reuses unchanged rows (structural sharing) and updates live", async () => {
    const t = createTestRuntime()
    await t.seedScope(EV, "match")
    await t.db.matches.bulkPut([match(1), match(2)])
    const { result } = renderHook(() => useMatches(t), { wrapper: t.wrapper })
    await waitFor(() => expect(result.current.status).toBe("success"))
    const first = result.current.status === "success" ? result.current.data : []
    await t.db.matches.put({ ...(match(2) as object), rev: 2 } as never)
    await waitFor(() =>
      expect(
        result.current.status === "success" && result.current.data[1]
      ).toMatchObject({ rev: 2 })
    )
    const second =
      result.current.status === "success" ? result.current.data : []
    expect(second[0]).toBe(first[0])
    expect(second[1]).not.toBe(first[1])
  })

  it("turns a failing query into an error with a retry", async () => {
    const t = createTestRuntime()
    await t.seedScope(EV, "match")
    let fail = true
    const { result, rerender } = renderHook(() => useMatches(t, { fail }), {
      wrapper: t.wrapper,
    })
    await waitFor(() => expect(result.current.status).toBe("error"))
    expect(result.current).toMatchObject({
      error: { code: "unknown", message: "Something went wrong. Try again." },
    })
    fail = false
    rerender()
    await waitFor(() => expect(result.current.status).toBe("empty"))
  })
})

describe("useRecordState (data-layer §9.2.1)", () => {
  const ID_OLD = "01900000-0000-7000-8000-000000000001" // created 2024
  function useComment(
    t: ReturnType<typeof createTestRuntime>,
    id: string | undefined,
    explain?: "not-scouted"
  ) {
    return useRecordState({
      enabled: id !== undefined,
      source: { scope: EV, entity: "comment" },
      id,
      deps: [id],
      query: () => t.db.comments.get(id ?? ""),
      ...(explain ? { explainMissing: () => Promise.resolve(explain) } : {}),
    })
  }

  it("is idle without an id, and success when the record exists", async () => {
    const t = createTestRuntime()
    await t.seedScope(EV, "comment")
    expect(
      renderHook(() => useComment(t, undefined), { wrapper: t.wrapper }).result
        .current
    ).toEqual({ status: "idle" })
    await t.db.comments.put({ id: ID_OLD, body: "Fast" } as never)
    const { result } = renderHook(() => useComment(t, ID_OLD), {
      wrapper: t.wrapper,
    })
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "success",
        data: { body: "Fast" },
      })
    )
  })

  it("rule 2: a tombstone means it was deleted (not-found)", async () => {
    const t = createTestRuntime()
    await t.seedScope(EV, "comment", { bootstrapState: "running" })
    await t.db.tombstones.put({
      entity: "comment",
      id: ID_OLD,
      rev: 2,
      deletedAt: 0,
      eventKey: null,
      syncState: "synced",
    })
    const { result } = renderHook(() => useComment(t, ID_OLD), {
      wrapper: t.wrapper,
    })
    await waitFor(() =>
      expect(result.current).toEqual({ status: "missing", reason: "not-found" })
    )
  })

  it("rule 3: before the first sync finishes it's not-synced, and the engine is asked once", async () => {
    const t = createTestRuntime()
    await t.seedScope(EV, "comment", { bootstrapState: "running" })
    const { result, rerender } = renderHook(() => useComment(t, ID_OLD), {
      wrapper: t.wrapper,
    })
    await waitFor(() =>
      expect(result.current).toEqual({
        status: "missing",
        reason: "not-synced",
      })
    )
    rerender()
    await waitFor(() => expect(t.syncRequests).toHaveLength(1))
  })

  it("rule 4: an id created after the last pull is not-synced; an old one is not-found", async () => {
    const t = createTestRuntime()
    const lastPulledAt = Date.UTC(2026, 2, 20)
    await t.seedScope(EV, "comment", { lastPulledAt })
    const newer = `${(lastPulledAt + 60_000)
      .toString(16)
      .padStart(12, "0")
      .replace(/^(.{8})(.{4})$/, "$1-$2")}-7000-8000-000000000001`
    const a = renderHook(() => useComment(t, newer), { wrapper: t.wrapper })
    await waitFor(() =>
      expect(a.result.current).toEqual({
        status: "missing",
        reason: "not-synced",
      })
    )
    const b = renderHook(() => useComment(t, ID_OLD), { wrapper: t.wrapper })
    await waitFor(() =>
      expect(b.result.current).toEqual({
        status: "missing",
        reason: "not-found",
      })
    )
  })

  it("rule 5: a feature explains a missing record (not-scouted)", async () => {
    const t = createTestRuntime()
    await t.seedScope(EV, "comment", { lastPulledAt: Date.UTC(2026, 2, 20) })
    const { result } = renderHook(() => useComment(t, ID_OLD, "not-scouted"), {
      wrapper: t.wrapper,
    })
    await waitFor(() =>
      expect(result.current).toEqual({
        status: "missing",
        reason: "not-scouted",
      })
    )
  })

  it("rule 1: forbidden scopes, and errors with retry", async () => {
    const t = createTestRuntime()
    await t.seedScope(EV, "comment", { forbidden: true })
    expect(
      renderHook(() => useComment(t, ID_OLD), { wrapper: t.wrapper }).result
        .current
    ).toEqual({
      status: "missing",
      reason: "forbidden",
    })
    const failing = renderHook(
      () =>
        useRecordState({
          enabled: true,
          source: { scope: "global", entity: "team" },
          deps: [],
          query: () =>
            Promise.reject(
              Object.assign(new Error("x"), { name: "DatabaseClosedError" })
            ),
        }),
      { wrapper: t.wrapper }
    )
    await waitFor(() =>
      expect(failing.result.current).toMatchObject({
        status: "error",
        error: { code: "closed" },
      })
    )
  })
})
