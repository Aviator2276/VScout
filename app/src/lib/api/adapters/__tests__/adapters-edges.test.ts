import { describe, expect, it } from "vitest"
import { dmChannelId } from "@/lib/contracts/message"
import { isKnownErrorCode } from "@/lib/contracts/problem"
import {
  wireAllianceBoard,
  wireEventSettings,
  wireEventTeam,
} from "@/testing/factories/wire"
import { decodeRecord } from "../entity-registry"
import { decodeMeta } from "../meta-adapter"
import { decodeMe, decodeSession } from "../session-adapter"
import { decodeSyncChanges } from "../sync-changes-adapter"
import { isoToMs, isoToMsOrNull } from "../time"

const T = "2026-03-20T15:00:00.000Z"
const MS = Date.UTC(2026, 2, 20, 15, 0)

describe("adapter edge cases", () => {
  it("converts nested timestamps on boards, event settings and event teams", () => {
    const board = decodeRecord(
      "allianceBoard",
      wireAllianceBoard({
        locked: true,
        lockedAt: T,
        history: [
          { id: "a1", actorId: "u1", kind: "pick", team: 254, seed: 1, at: T },
        ],
      })
    )
    expect(board.ok && board.value).toMatchObject({
      lockedAt: MS,
      history: [{ at: MS }],
    })

    const settings = decodeRecord(
      "eventSettings",
      wireEventSettings({
        guestAccess: { enabled: true, code: "K7M2QX", rotatedAt: T },
      })
    )
    expect(settings.ok && settings.value.guestAccess).toEqual({
      enabled: true,
      code: "K7M2QX",
      rotatedAt: MS,
    })

    const eventTeam = decodeRecord(
      "eventTeam",
      wireEventTeam({ statsUpdatedAt: T })
    )
    expect(eventTeam.ok && eventTeam.value).toMatchObject({
      statsUpdatedAt: MS,
      pitLocation: null,
      rankingPoints: null,
    })
  })

  it("rejects malformed top-level responses", () => {
    expect(decodeMeta({}).ok).toBe(false)
    expect(decodeSession({ accessToken: "" }).ok).toBe(false)
    expect(decodeMe({}).ok).toBe(false)
    expect(decodeSyncChanges({ changes: "nope" }).ok).toBe(false)
  })

  it("decodes /me", () => {
    const r = decodeMe({
      user: { id: "u1", username: "alex", displayName: "Alex", role: "admin" },
      serverTime: T,
      refreshExpiresAt: T,
      permissions: ["admin:access"],
    })
    expect(r.ok && r.value).toMatchObject({
      user: { role: "admin", teamNumber: null },
      permissions: ["admin:access"],
      serverTime: MS,
    })
  })

  it("time helpers", () => {
    expect(isoToMs(T)).toBe(MS)
    expect(isoToMsOrNull(null)).toBeNull()
    expect(() => isoToMs("not a date")).toThrow()
  })

  it("builds DM channel ids from sorted user ids", () => {
    expect(dmChannelId("b", "a")).toBe("dm:a:b")
  })

  it("knows the stable error codes", () => {
    expect(isKnownErrorCode("rev_conflict")).toBe(true)
    expect(isKnownErrorCode("http_502")).toBe(false)
  })
})
