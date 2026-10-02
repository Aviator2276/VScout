import { describe, expect, it } from "vitest"
import { isCompleteCode, normalizeGuestCode } from "../utils/guest-code"
import { endedMessage, loginMessage } from "../utils/login-messages"

describe("guest code (ui-patterns §9B)", () => {
  it("uppercases and strips spaces, dashes and other characters, capped at 6", () => {
    expect(normalizeGuestCode("k7m-2qx")).toEqual({
      code: "K7M2QX",
      ambiguous: false,
    })
    expect(normalizeGuestCode(" K7M 2QX 99 ")).toEqual({
      code: "K7M2QX",
      ambiguous: false,
    })
  })

  it("flags 0, O, 1 and I instead of guessing", () => {
    expect(normalizeGuestCode("AB0")).toEqual({ code: "AB", ambiguous: true })
    expect(normalizeGuestCode("io")).toEqual({ code: "", ambiguous: true })
    expect(isCompleteCode("K7M2QX")).toBe(true)
    expect(isCompleteCode("K7M2Q")).toBe(false)
  })
})

describe("messages", () => {
  it("explain what happened and what to do", () => {
    expect(loginMessage("invalid_credentials", "account")).toMatch(
      /don't match/
    )
    expect(loginMessage("invalid_guest_code", "guest")).toMatch(/didn't work/)
    expect(loginMessage("rate_limited", "guest")).toMatch(/5 minutes/)
    expect(loginMessage("offline", "guest")).toMatch(/as a guest/)
    expect(loginMessage("offline", "account")).toBe(
      "You're offline. Connect to sign in."
    )
    expect(loginMessage("unknown", "account")).toMatch(/Try again/)
  })

  it("say why a forced logout happened; a normal sign-out says nothing", () => {
    expect(endedMessage(undefined)).toBeNull()
    expect(endedMessage("logout")).toBeNull()
    for (const r of [
      "guest_access_disabled",
      "guest_code_rotated",
      "account_disabled",
      "session_revoked",
      "cookie-user-mismatch",
    ])
      expect(endedMessage(r)).toEqual(expect.any(String))
  })
})
