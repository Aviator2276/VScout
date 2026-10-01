import { describe, expect, it } from "vitest"
import { guestCode, sessionResponse } from "../auth"
import { wireEventSettings } from "../event-settings"
import { metaResponse } from "../meta"
import { problem } from "../problem"
import { pushPayload } from "../push"
import { reactionEmoji } from "../reaction"
import { rpcRequest } from "../rpc"
import { userSettingsDocument } from "../user-settings"
import login from "./fixtures/login.json"
import meta from "./fixtures/meta.json"
import problem409 from "./fixtures/problem-409.json"

describe("wire contracts", () => {
  it("parses the recorded /meta and keeps unknown fields", () => {
    const m = metaResponse.parse(meta)
    expect(m.capabilities.mqttRpc).toBe(true)
    expect(m).toHaveProperty("region", "us-west")
  })

  it("parses a login response", () => {
    expect(sessionResponse.parse(login).user.role).toBe("scouter")
  })

  it("parses a 409 problem with the server copy", () => {
    const p = problem.parse(problem409)
    expect(p.code).toBe("rev_conflict")
    expect(p.current).toMatchObject({ rev: 4 })
  })

  describe("guest code (ADR-073)", () => {
    it("normalizes case and whitespace", () => {
      expect(guestCode.parse(" k7m2qx ")).toBe("K7M2QX")
    })
    it.each(["K7M2Q", "K7M2QX9", "O7M2QX", "I7M2QX", "17M2QX", "07M2QX"])(
      "rejects %s",
      (code) => {
        expect(guestCode.safeParse(code).success).toBe(false)
      }
    )
  })

  it("allows only the six reaction emoji", () => {
    expect(reactionEmoji.safeParse("👍").success).toBe(true)
    expect(reactionEmoji.safeParse("🚀").success).toBe(false)
  })

  it("falls back to defaults for invalid admin config instead of rejecting eventSettings", () => {
    const s = wireEventSettings.parse({
      id: "2026casj",
      rev: 2,
      updatedAt: "2026-03-20T15:00:00.000Z",
      eventKey: "2026casj",
      recommender: { segments: 99 },
      guestAccess: { enabled: "yes" },
    })
    expect(s.recommender?.segments).toBe(3)
    expect(s.guestAccess).toEqual({
      enabled: false,
      code: null,
      rotatedAt: null,
    })
  })

  it("keeps unknown userSettings keys and fills defaults", () => {
    const s = userSettingsDocument.parse({ v: 1, futureKey: { a: 1 } })
    expect(s).toHaveProperty("futureKey", { a: 1 })
    expect(s.notifications.eventChat).toBe("all")
    expect(s.notifications.matchLeadMinutes).toBe(10)
  })

  it("rejects push deep links that aren't app-relative", () => {
    const base = {
      web_push: 8030,
      notification: {
        title: "Announcement",
        navigate: "https://vscout.app/scout/announcements",
        tag: "announcement:1",
        data: {
          v: 1,
          id: "n1",
          kind: "announcement",
          url: "/scout/announcements",
          uid: "u1",
          eventKey: "2026casj",
          entity: null,
          ts: "2026-03-20T15:00:00.000Z",
        },
      },
    }
    expect(pushPayload.safeParse(base).success).toBe(true)
    const evil = structuredClone(base)
    evil.notification.data.url = "//evil.example/phish"
    expect(pushPayload.safeParse(evil).success).toBe(false)
  })

  it("validates RPC requests", () => {
    expect(
      rpcRequest.safeParse({
        v: 1,
        id: "r1",
        method: "GET",
        path: "/sync/changes",
        headers: { Authorization: "Bearer x" },
      }).success
    ).toBe(true)
    expect(
      rpcRequest.safeParse({
        v: 1,
        id: "r1",
        method: "TRACE",
        path: "/x",
        headers: {},
      }).success
    ).toBe(false)
  })
})
