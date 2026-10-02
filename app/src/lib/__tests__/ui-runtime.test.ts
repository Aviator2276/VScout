import { afterEach, describe, expect, it, vi } from "vitest"
import { toAppError } from "../errors"
import { configureHaptics, haptic } from "../haptics"
import { uuidv7Time } from "../ids"

afterEach(() => vi.unstubAllGlobals())

describe("haptics", () => {
  it("vibrates on Android, does nothing when off", () => {
    const vibrate = vi.fn()
    vi.stubGlobal("navigator", { vibrate })
    configureHaptics({ enabled: true, iosExperiment: false })
    haptic("success")
    expect(vibrate).toHaveBeenCalledWith([12, 40, 12])
    configureHaptics({ enabled: false, iosExperiment: false })
    haptic("error")
    expect(vibrate).toHaveBeenCalledOnce()
  })

  it("is a no-op on iOS unless the experiment is on", () => {
    vi.stubGlobal("navigator", {})
    configureHaptics({ enabled: true, iosExperiment: false })
    expect(() => haptic("selection")).not.toThrow()
  })
})

describe("helpers", () => {
  it("reads the time out of a UUIDv7", () => {
    expect(uuidv7Time("01922b6e-1d80-7abc-8def-0123456789ab")).toBe(
      0x01922b6e1d80
    )
    expect(uuidv7Time("not-a-uuid")).toBeNull()
    expect(uuidv7Time("01922b6e-1d80-4abc-8def-0123456789ab")).toBeNull() // v4
  })

  it("never shows raw error text", () => {
    expect(
      toAppError(Object.assign(new Error("x"), { name: "DatabaseClosedError" }))
    ).toMatchObject({ code: "closed" })
    expect(
      toAppError(Object.assign(new Error("x"), { name: "QuotaExceededError" }))
    ).toMatchObject({ code: "db" })
    expect(toAppError(new TypeError("y is undefined"))).toMatchObject({
      code: "unknown",
      message: "Something went wrong. Try again.",
    })
    expect(toAppError("weird")).toMatchObject({ code: "unknown" })
  })
})
