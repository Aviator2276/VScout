import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { harness } from "../helpers.js"
import type { Harness } from "../helpers.js"

let h: Harness
beforeEach(async () => {
  h = await harness()
})
afterEach(async () => h.close())

const refresh = (cookie: string) => h.req({ method: "POST", url: "/api/v1/auth/refresh", headers: { cookie }, key: null })

describe("login → refresh (cookie) → /me", () => {
  it("logs in, sets an HttpOnly cookie scoped to /api/v1/auth, and /me answers", async () => {
    const r = await h.req({ method: "POST", url: "/api/v1/auth/login", body: { username: "alex", password: "pw-alex-123", deviceId: "d1", deviceName: "Phone" } })
    expect(r.status).toBe(200)
    expect(r.body.user).toMatchObject({ username: "alex", role: "admin", displayName: "Alex" })
    expect(r.body).not.toHaveProperty("refreshToken")
    const cookie = String(r.headers["set-cookie"])
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Strict/)
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/)
    expect(cookie).toMatch(/Secure/)
    const me = await h.req({ method: "GET", url: "/api/v1/me", as: { ...h.admin, token: r.body.accessToken } })
    expect(me.status).toBe(200)
    expect(me.body.user.id).toBe(r.body.user.id)
    expect(Date.parse(me.body.refreshExpiresAt)).toBeGreaterThan(h.clock.now() + 7 * 86_400_000)
  })

  it("rejects a wrong password with 401 invalid_credentials and rate-limits repeats", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await h.req({ method: "POST", url: "/api/v1/auth/login", body: { username: "alex", password: "wrong", deviceId: "d1", deviceName: "" } })
      expect(r.body.code).toBe("invalid_credentials")
    }
    const r = await h.req({ method: "POST", url: "/api/v1/auth/login", body: { username: "alex", password: "pw-alex-123", deviceId: "d1", deviceName: "" } })
    expect(r.status).toBe(429)
    expect(r.headers["retry-after"]).toBeDefined()
  })

  it("rotates on refresh, and a replayed old token within 60 s returns the same new token", async () => {
    const first = await refresh(h.admin.cookie)
    expect(first.status).toBe(200)
    expect(first.body.deviceId).toBe(h.admin.deviceId)
    const newCookie = String(first.headers["set-cookie"]).split(";")[0] as string
    expect(newCookie).not.toBe(h.admin.cookie)
    h.clock.advance(30_000)
    const replay = await refresh(h.admin.cookie)
    expect(replay.status).toBe(200)
    expect(String(replay.headers["set-cookie"]).split(";")[0]).toBe(newCookie)
    // the new token keeps working
    expect((await refresh(newCookie)).status).toBe(200)
  })

  it("treats a replay after the grace window as theft and revokes the family", async () => {
    const first = await refresh(h.admin.cookie)
    const newCookie = String(first.headers["set-cookie"]).split(";")[0] as string
    h.clock.advance(61_000)
    const late = await refresh(h.admin.cookie)
    expect(late.status).toBe(401)
    expect(late.body.code).toBe("refresh_invalid")
    expect((await refresh(newCookie)).status).toBe(401)
  })

  it("keeps sessions per device: a login on device B never ends device A", async () => {
    const sam = await h.user("sam")
    const other = await h.login("alex", "pw-alex-123", "laptop")
    expect((await refresh(h.admin.cookie)).status).toBe(200)
    expect((await refresh(other.cookie)).status).toBe(200)
    expect((await refresh(sam.cookie)).body.user.username).toBe("sam")
  })

  it("logout revokes this device's family and its push subscription", async () => {
    h.s.push.upsert(h.admin.userId, h.admin.deviceId, {
      subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString("base64url"), auth: Buffer.alloc(16, 2).toString("base64url") } },
    })
    const r = await h.req({ method: "POST", url: "/api/v1/auth/logout", as: h.admin, body: { deviceId: h.admin.deviceId }, headers: { cookie: h.admin.cookie } })
    expect(r.status).toBe(204)
    expect((await refresh(h.admin.cookie)).status).toBe(401)
    expect(h.s.db.get("SELECT * FROM push_subscriptions WHERE device_id = ?", h.admin.deviceId)).toBeUndefined()
    // the access token of a logged-out session stops working too
    expect((await h.req({ method: "GET", url: "/api/v1/me", as: h.admin })).status).toBe(401)
  })

  it("expires access tokens with 401 token_expired", async () => {
    h.clock.advance(16 * 60_000)
    const r = await h.req({ method: "GET", url: "/api/v1/me", as: h.admin })
    expect(r.status).toBe(401)
    expect(r.body.code).toBe("token_expired")
  })

  it("puts the MQTT binding and ACL in the token", async () => {
    const [, payload] = h.admin.token.split(".")
    const claims = JSON.parse(Buffer.from(payload as string, "base64url").toString())
    expect(claims.sub).toBe(h.admin.userId)
    expect(claims.cid).toBe(`vscout-${h.admin.userId}-${h.admin.deviceId}`)
    expect(claims.role).toBe("admin")
    expect(claims.acl).toContainEqual({ permission: "allow", action: "subscribe", topic: "vscout/event/+/admin/#" })
    const jwks = await h.req({ method: "GET", url: "/.well-known/jwks.json" })
    expect(jwks.body.keys[0]).toMatchObject({ kty: "RSA", alg: "RS256" })
  })
})

describe("version gate", () => {
  it("answers 426 upgrade_required below minClientVersion, except /auth/* and /meta", async () => {
    const old = { "x-client-version": "1.9.0" }
    const r = await h.req({ method: "GET", url: "/api/v1/me", as: h.admin, headers: old })
    expect(r.status).toBe(426)
    expect(r.body).toMatchObject({ code: "upgrade_required", minVersion: "2.0.0-alpha.0" })
    expect((await h.req({ method: "GET", url: "/api/v1/meta", headers: old })).status).toBe(200)
    expect((await refresh(h.admin.cookie)).status).toBe(200)
    // a prerelease above the minimum passes
    expect((await h.req({ method: "GET", url: "/api/v1/me", as: h.admin, headers: { "x-client-version": "2.0.0-alpha.3" } })).status).toBe(200)
  })

  it("lists only the capabilities it implements", async () => {
    const r = await h.req({ method: "GET", url: "/api/v1/meta" })
    expect(r.body.capabilities).toMatchObject({ guestLogin: true, reactions: true, restore: true, batchPush: true, changeStream: true })
    expect(r.body.capabilities.readMarkers).toBeUndefined()
    expect(r.body.capabilities.demoSeed).toBeUndefined()
    expect(r.body.gameSchemaVersions).toEqual({ "2026-rebuilt": [1] })
  })
})

describe("users (admin)", () => {
  it("creates an account with a generated three-word passphrase that works for login", async () => {
    const r = await h.req({ method: "POST", url: "/api/v1/admin/users", as: h.admin, body: { username: "jo", displayName: "Jo", role: "scouter" } })
    expect(r.status).toBe(201)
    expect(r.body.passphrase).toMatch(/^[a-z]+ [a-z]+ [a-z]+ \d{2}$/)
    expect(r.body.user).toMatchObject({ username: "jo", role: "scouter", active: true, rev: 1 })
    expect((await h.login("jo", r.body.passphrase)).role).toBe("scouter")
  })

  it("refuses scouters (403 role_required)", async () => {
    const sam = await h.user("sam")
    const r = await h.req({ method: "GET", url: "/api/v1/admin/users", as: sam })
    expect(r.status).toBe(403)
    expect(r.body.code).toBe("role_required")
  })

  it("never demotes or deactivates the last active admin (409 last_admin)", async () => {
    const r = await h.req({ method: "PATCH", url: `/api/v1/admin/users/${h.admin.userId}`, as: h.admin, body: { role: "scouter" } })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("last_admin")
    const off = await h.req({ method: "PATCH", url: `/api/v1/admin/users/${h.admin.userId}`, as: h.admin, body: { active: false } })
    expect(off.body.code).toBe("last_admin")
  })

  it("a role change publishes inbox roleChanged and the old token stops working", async () => {
    const sam = await h.user("sam")
    const r = await h.req({ method: "PATCH", url: `/api/v1/admin/users/${sam.userId}`, as: h.admin, body: { role: "admin", scouterLevel: "experienced" } })
    expect(r.status).toBe(200)
    expect(r.body.role).toBe("admin")
    expect(h.link.on(`vscout/user/${sam.userId}/inbox`)[0]?.payload).toMatchObject({ kind: "roleChanged", role: "admin" })
    expect((await h.req({ method: "GET", url: "/api/v1/me", as: sam })).status).toBe(401)
    const again = await refresh(sam.cookie)
    expect(again.body.user.role).toBe("admin")
    expect(h.s.store.live("userSettings", sam.userId)?.scouterLevel).toBe("experienced")
  })

  it("revoke-sessions ends refresh families and publishes sessionRevoked", async () => {
    const sam = await h.user("sam")
    const r = await h.req({ method: "POST", url: `/api/v1/admin/users/${sam.userId}/revoke-sessions`, as: h.admin })
    expect(r.status).toBe(204)
    expect((await refresh(sam.cookie)).status).toBe(401)
    expect(h.link.on(`vscout/user/${sam.userId}/inbox`)[0]?.payload.kind).toBe("sessionRevoked")
  })

  it("changes your own password (422 on a wrong current one)", async () => {
    const bad = await h.req({ method: "POST", url: "/api/v1/me/password", as: h.admin, body: { currentPassword: "nope", newPassword: "a new password" } })
    expect(bad.status).toBe(422)
    expect(bad.body.code).toBe("invalid_credentials")
    const ok = await h.req({ method: "POST", url: "/api/v1/me/password", as: h.admin, body: { currentPassword: "pw-alex-123", newPassword: "a new password" } })
    expect(ok.status).toBe(204)
    await expect(h.login("alex", "a new password", "x")).resolves.toBeTruthy()
  })
})
