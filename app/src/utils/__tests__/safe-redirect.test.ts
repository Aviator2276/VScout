import { describe, expect, it } from "vitest"
import { safeRedirect } from "../safe-redirect"

describe("safeRedirect (routing-auth §6)", () => {
  it.each([
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["https://evil.com", "/"],
    ["javascript:alert(1)", "/"],
    ["/login?redirect=/login", "/"],
    [42, "/"],
    ["", "/"],
    ["/teams/42?sort=epa", "/teams/42?sort=epa"],
    ["/matches/2026casj_qm12#notes", "/matches/2026casj_qm12#notes"],
  ])("%j → %s", (raw, expected) => {
    expect(safeRedirect(raw)).toBe(expected)
  })

  it("uses the given fallback", () => {
    expect(safeRedirect("//x", "/home")).toBe("/home")
  })
})
