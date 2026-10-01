import { describe, expect, it } from "vitest"
import { decodeClaims } from "../jwt-claims"
import { createTokenStore } from "../token-store"

const b64url = (o: unknown) =>
  btoa(JSON.stringify(o))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

describe("jwt claims", () => {
  it("reads exp, role and cid without verifying", () => {
    const token = `${b64url({ alg: "RS256" })}.${b64url({ sub: "u1", exp: 123, role: "scouter", cid: "vscout-u1-d1" })}.sig`
    expect(decodeClaims(token)).toMatchObject({
      sub: "u1",
      exp: 123,
      role: "scouter",
      cid: "vscout-u1-d1",
    })
  })
  it("returns null for garbage", () => {
    expect(decodeClaims("nope")).toBeNull()
    expect(decodeClaims("a.%%%.c")).toBeNull()
    expect(decodeClaims(`x.${b64url({ role: "superuser" })}.y`)).toBeNull()
  })
})

describe("token store", () => {
  it("keeps the token in memory and notifies", () => {
    const t = createTokenStore()
    let n = 0
    const off = t.subscribe(() => n++)
    t.set("abc", 1000)
    expect([t.get(), t.expiresAt()]).toEqual(["abc", 1000])
    t.clear()
    expect(t.get()).toBeNull()
    off()
    t.set("x", 1)
    expect(n).toBe(2)
  })
})
