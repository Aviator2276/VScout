import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"
import { createTestRuntime } from "@/testing/data-runtime"
import {
  DataRuntimeContext,
  useAdminActions,
  useDataRuntime,
  useLiveActions,
  useVideoManager,
  useViewer,
  useWriter,
} from "../data-runtime"
import type { DataRuntime } from "../data-runtime"

function wrap(runtime: DataRuntime) {
  return ({ children }: { children: ReactNode }) => (
    <DataRuntimeContext value={runtime}>{children}</DataRuntimeContext>
  )
}

describe("data runtime hooks", () => {
  it("useDataRuntime outside a provider is a bug", () => {
    expect(() => renderHook(() => useDataRuntime())).toThrow(
      /outside DataRuntimeContext/
    )
  })

  it("useViewer follows the session and is null without one", () => {
    const t = createTestRuntime()
    const { result } = renderHook(() => useViewer(), {
      wrapper: wrap(t.runtime),
    })
    expect(result.current).toMatchObject({ role: "scouter" })
    act(() => t.setViewer({ userId: "a", role: "admin" }))
    expect(result.current).toEqual({ userId: "a", role: "admin" })

    const { viewer: _, ...noViewer } = t.runtime
    expect(
      renderHook(() => useViewer(), { wrapper: wrap(noViewer) }).result.current
    ).toBeNull()
  })

  it("the optional services throw when the runtime doesn't have them", () => {
    const { writer: _, ...bare } = createTestRuntime().runtime
    const wrapper = wrap(bare)
    expect(() => renderHook(() => useWriter(), { wrapper })).toThrow(
      /no writer/
    )
    expect(() => renderHook(() => useLiveActions(), { wrapper })).toThrow(
      /no live actions/
    )
    expect(() => renderHook(() => useVideoManager(), { wrapper })).toThrow(
      /no video manager/
    )
    expect(() => renderHook(() => useAdminActions(), { wrapper })).toThrow(
      /no admin actions/
    )
  })

  it("the optional services are returned when present", () => {
    const t = createTestRuntime()
    const live = {} as NonNullable<DataRuntime["live"]>
    const videos = {} as NonNullable<DataRuntime["videos"]>
    const admin = {} as NonNullable<DataRuntime["admin"]>
    const wrapper = wrap({ ...t.runtime, live, videos, admin })
    const { result } = renderHook(
      () => [
        useWriter(),
        useLiveActions(),
        useVideoManager(),
        useAdminActions(),
      ],
      { wrapper }
    )
    expect(result.current).toEqual([t.writer, live, videos, admin])
  })
})
