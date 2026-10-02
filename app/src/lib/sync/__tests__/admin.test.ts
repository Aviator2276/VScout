import { beforeEach, describe, expect, it } from "vitest"
import { setupEngine } from "@/testing/engine"
import { MOCK_USER_ID, mockBackend } from "@/testing/mocks/mock-backend"
import {
  GUEST_CODE_ALPHABET,
  createUser,
  generateGuestCode,
  patchUser,
  saveGuestAccess,
} from "../admin-actions"
import { patchEventSettings, setTeamNumber } from "../admin-writes"
import type { LiveDeps } from "../live-actions"

beforeEach(() => {
  mockBackend.reset()
  mockBackend.role = "admin"
})

function deps(t: ReturnType<typeof setupEngine>): LiveDeps {
  return {
    api: t.api,
    db: t.db,
    games: () => null,
    now: t.clock.now,
    newId: () => crypto.randomUUID(),
  }
}

describe("guest access (features/admin.md AD3b, criteria 7, 8b)", () => {
  it("codes are 6 characters with no 0, O, 1 or I", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateGuestCode()
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/)
      for (const ch of code) expect(GUEST_CODE_ALPHABET).toContain(ch)
    }
  })

  it("turning it on saves a code; a taken code is replaced silently", async () => {
    const t = setupEngine({ role: "admin" })
    mockBackend.takenGuestCodes.add("AAAAAA")
    const codes = ["AAAAAA", "BBBBBB"]
    const r = await saveGuestAccess(
      deps(t),
      "2026casj",
      { enabled: true, newCode: true },
      () => codes.shift() ?? "CCCCCC"
    )
    expect(r).toEqual({ kind: "ok" })
    expect(
      (await t.db.eventSettings.get("2026casj"))?.guestAccess
    ).toMatchObject({ enabled: true, code: "BBBBBB" })
  })

  it("turning it off keeps the code for later", async () => {
    const t = setupEngine({ role: "admin" })
    await saveGuestAccess(
      deps(t),
      "2026casj",
      { enabled: true, newCode: true },
      () => "K7M2QX"
    )
    await saveGuestAccess(deps(t), "2026casj", {
      enabled: false,
      newCode: false,
    })
    expect(
      (await t.db.eventSettings.get("2026casj"))?.guestAccess
    ).toMatchObject({ enabled: false, code: "K7M2QX" })
  })
})

describe("admin singletons go through the outbox (AD3, AD3a)", () => {
  it("scouting open and the team number reach the server with baseRev", async () => {
    const t = setupEngine({ role: "admin" })
    await saveGuestAccess(deps(t), "2026casj", {
      enabled: false,
      newCode: false,
    })
    await patchEventSettings(t.mutateDeps, "2026casj", { scoutingOpen: false })
    await setTeamNumber(t.mutateDeps, 254)
    expect(await t.db.outbox.count()).toBe(2)
    await t.engine.syncNow("write", { pushOnly: true })
    expect(await t.db.outbox.count()).toBe(0)
    expect(mockBackend.records.get("eventSettings:2026casj")).toMatchObject({
      scoutingOpen: false,
      rev: 2,
    })
    expect(mockBackend.records.get("teamSettings:team")).toMatchObject({
      teamNumber: 254,
    })
  })
})

describe("users (AD2, criterion 4)", () => {
  it("creates an account and shows the passphrase once", async () => {
    const t = setupEngine({ role: "admin" })
    const r = await createUser(deps(t), {
      username: "sam",
      displayName: "Sam",
      role: "scouter",
    })
    expect(r.kind).toBe("ok")
    if (r.kind === "ok") expect(r.passphrase).toMatch(/-/)
    expect(await t.db.users.filter((u) => u.username === "sam").count()).toBe(1)
  })

  it("the last admin can't demote themselves", async () => {
    const t = setupEngine({ role: "admin" })
    expect(
      await patchUser(deps(t), MOCK_USER_ID, { role: "scouter" })
    ).toMatchObject({ kind: "error", code: "last_admin" })
  })
})
