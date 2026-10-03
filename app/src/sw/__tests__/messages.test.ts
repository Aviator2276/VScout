import { describe, expect, it } from "vitest"
import { isSwMessage } from "../messages"

describe("isSwMessage", () => {
  it("accepts the two page → SW messages", () => {
    expect(isSwMessage({ type: "SKIP_WAITING" })).toBe(true)
    expect(isSwMessage({ type: "GET_VERSION" })).toBe(true)
  })
  it.each([null, "SKIP_WAITING", {}, { type: "CLEAR" }, 42])(
    "rejects %j",
    (value) => {
      expect(isSwMessage(value)).toBe(false)
    }
  )
})
