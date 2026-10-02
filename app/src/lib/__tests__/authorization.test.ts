import { describe, expect, it } from "vitest"
import {
  PERMISSIONS,
  POLICIES,
  ROLE_PERMISSIONS,
  can,
  requirePermission,
  ForbiddenError,
} from "../authorization"
import type { Permission } from "../authorization"

const admin = { userId: "a", role: "admin" as const }
const scouter = { userId: "s", role: "scouter" as const }
const guest = { userId: "g", role: "guest" as const }

/** routing-auth §8.1, role-level (policies checked separately) */
const TABLE: Record<
  Permission,
  [admin: boolean, scouter: boolean, guest: boolean]
> = {
  "event:read": [true, true, true],
  "event:select": [true, true, true],
  "event:manage": [true, false, false],
  "scouting:read": [true, true, true],
  "scouting:create": [true, true, false],
  "scouting:update": [true, true, false],
  "scouting:delete": [true, true, false],
  "comment:read": [true, true, true],
  "comment:create": [true, true, false],
  "comment:update": [true, true, false],
  "comment:delete": [true, true, false],
  "picklist:read": [true, true, true],
  "picklist:create": [true, true, false],
  "picklist:update": [true, true, false],
  "picklist:delete": [true, true, false],
  "picklist:follow": [true, false, false],
  "alliance-board:record": [true, true, false],
  "alliance-board:lock": [true, false, false],
  "alliance-board:undo-any": [true, false, false],
  "alliance-sim:use": [true, true, true],
  "strategy:read": [true, true, true],
  "announcement:read": [true, true, true],
  "message:read": [true, true, false],
  "message:send": [true, true, false],
  "dm:use": [true, true, false],
  "message:delete": [true, true, false],
  "reaction:create": [true, true, true],
  "reaction:delete": [true, true, true],
  "announcement:create": [true, false, false],
  "announcement:manage": [true, false, false],
  "settings:update-own": [true, true, false],
  "team-settings:manage": [true, false, false],
  "media:download": [true, true, true],
  "admin:access": [true, false, false],
  "user:manage": [true, false, false],
}

describe("role permissions (routing-auth §8.1)", () => {
  it("the table covers every permission", () => {
    expect(Object.keys(TABLE).sort()).toEqual([...PERMISSIONS].sort())
  })

  it.each(PERMISSIONS.map((p) => [p, ...TABLE[p]] as const))(
    "%s → admin %s, scouter %s, guest %s",
    (p, a, s, g) => {
      expect(ROLE_PERMISSIONS.admin.includes(p)).toBe(a)
      expect(ROLE_PERMISSIONS.scouter.includes(p)).toBe(s)
      expect(ROLE_PERMISSIONS.guest.includes(p)).toBe(g)
    }
  )

  it("denies everything without a session", () => {
    expect(can(null, "event:read")).toBe(false)
  })
})

describe("policies", () => {
  const own = { authorId: "s" }
  const other = { authorId: "x" }

  it("owner or admin may edit and delete", () => {
    expect(can(scouter, "scouting:update", own)).toBe(true)
    expect(can(scouter, "scouting:update", other)).toBe(false)
    expect(can(admin, "comment:delete", other)).toBe(true)
    expect(can(guest, "picklist:update", { authorId: "g" })).toBe(false) // no role permission at all
  })

  it("private notes are the author's only, admins included (ADR-040)", () => {
    expect(
      can(admin, "comment:read", { authorId: "s", visibility: "private" })
    ).toBe(false)
    expect(
      can(scouter, "comment:read", { authorId: "s", visibility: "private" })
    ).toBe(true)
    expect(
      can(guest, "comment:read", { authorId: "s", visibility: "team" })
    ).toBe(true)
  })

  it("DMs only for participants, admins included (R2-6)", () => {
    expect(can(admin, "dm:use", { participantIds: ["s", "x"] })).toBe(false)
    expect(can(scouter, "dm:use", { participantIds: ["s", "x"] })).toBe(true)
  })

  it("a locked board takes admin picks only (ADR-032)", () => {
    expect(can(scouter, "alliance-board:record", { locked: true })).toBe(false)
    expect(can(scouter, "alliance-board:record", { locked: false })).toBe(true)
    expect(can(admin, "alliance-board:record", { locked: true })).toBe(true)
  })

  it("guests react to announcements only; admins never touch DM reactions (ADR-073)", () => {
    expect(can(guest, "reaction:create", { targetType: "announcement" })).toBe(
      true
    )
    expect(can(guest, "reaction:create", { targetType: "message" })).toBe(false)
    expect(can(scouter, "reaction:create", { targetType: "message" })).toBe(
      true
    )
    expect(can(admin, "reaction:delete", { authorId: "x", inDm: false })).toBe(
      true
    )
    expect(can(admin, "reaction:delete", { authorId: "x", inDm: true })).toBe(
      false
    )
    expect(can(guest, "reaction:delete", { authorId: "g", inDm: false })).toBe(
      true
    )
  })

  it("every policy permission is in some role", () => {
    for (const p of Object.keys(POLICIES))
      expect(ROLE_PERMISSIONS.admin).toContain(p)
  })

  it("route guards throw ForbiddenError", () => {
    expect(() => requirePermission(scouter, "admin:access")).toThrow(
      ForbiddenError
    )
    expect(() => requirePermission(admin, "admin:access")).not.toThrow()
  })
})
