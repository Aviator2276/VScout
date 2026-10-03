import { beforeEach, describe, expect, it } from "vitest"
import page from "@/lib/contracts/__tests__/fixtures/sync-changes-page.json"
import meta from "@/lib/contracts/__tests__/fixtures/meta.json"
import login from "@/lib/contracts/__tests__/fixtures/login.json"
import { resetIds } from "@/testing/factories/ids"
import {
  wireAllianceBoard,
  wireComment,
  wireEnvelope,
  wireEvent,
  wireEventSettings,
  wireEventTeam,
  wireMatch,
  wireMessage,
  wirePicklist,
  wirePicklistEntry,
  wireReaction,
  wireScoutEntry,
  wireTeam,
  wireTeamSettings,
  wireUser,
  wireUserSettings,
} from "@/testing/factories/wire"
import { ENTITY_NAMES } from "@/lib/contracts/entities"
import { decodeChangeEnvelope } from "../change-envelope-adapter"
import { ENTITY_ADAPTERS, decodeRecord } from "../entity-registry"
import { decodeMeta } from "../meta-adapter"
import { decodeProblem } from "../problem-adapter"
import { decodeSession } from "../session-adapter"
import { decodeSyncChanges } from "../sync-changes-adapter"
import { teamAdapter } from "../reference-adapters"

const T0 = Date.UTC(2026, 2, 20, 15, 0)

beforeEach(() => resetIds())

describe("entity adapters", () => {
  it.each([
    ["event", () => wireEvent()],
    ["team", () => wireTeam()],
    ["eventTeam", () => wireEventTeam()],
    ["match", () => wireMatch()],
    ["user", () => wireUser()],
    ["userSettings", () => wireUserSettings()],
    ["teamSettings", () => wireTeamSettings()],
    ["scoutEntry", () => wireScoutEntry()],
    ["comment", () => wireComment()],
    ["message", () => wireMessage()],
    ["reaction", () => wireReaction()],
    ["picklist", () => wirePicklist()],
    ["picklistEntry", () => wirePicklistEntry()],
    ["eventSettings", () => wireEventSettings()],
    ["allianceBoard", () => wireAllianceBoard()],
  ] as const)("decodes a %s envelope from its factory", (entity, make) => {
    const r = decodeChangeEnvelope(wireEnvelope(entity, make() as never))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.change.entity).toBe(entity)
    expect(r.change.record).toBeDefined()
    expect(r.change.record?.updatedAt).toBe(T0)
  })

  it("maps owned records to synced domain records with ms timestamps", () => {
    const r = decodeRecord("scoutEntry", wireScoutEntry())
    expect(r.ok && r.value).toMatchObject({
      syncState: "synced",
      createdAt: T0,
      localUpdatedAt: T0,
      eventKey: "2026casj",
    })
  })

  it("adds Dexie keys and index fields to matches and events", () => {
    const m = decodeRecord("match", wireMatch({ matchNumber: 4 }))
    expect(m.ok && m.value.key).toBe("2026casj_qm4")
    expect(m.ok && m.value.teamNumbers).toEqual([
      254, 1678, 971, 2276, 604, 846,
    ])
    expect(m.ok && m.value.predictedTime).toBeNull()
    const e = decodeRecord("event", wireEvent())
    expect(e.ok && e.value).toMatchObject({ key: "2026casj", isDemo: false })
  })

  it("has an adapter for every entity", () => {
    expect(Object.keys(ENTITY_ADAPTERS).sort()).toEqual(
      [...ENTITY_NAMES].sort()
    )
  })
})

describe("change envelopes", () => {
  it("decodes a delete without data", () => {
    const r = decodeChangeEnvelope({
      v: 1,
      entity: "comment",
      op: "delete",
      id: "c1",
      rev: 3,
      eventKey: "2026casj",
      ts: "2026-03-20T15:00:00.000Z",
    })
    expect(r).toEqual({
      ok: true,
      change: {
        entity: "comment",
        op: "delete",
        id: "c1",
        rev: 3,
        eventKey: "2026casj",
        ts: T0,
      },
    })
  })

  it("rejects an upsert without data, an unknown entity and v2", () => {
    const base = {
      v: 1,
      entity: "team",
      op: "upsert",
      id: "1",
      rev: 1,
      eventKey: null,
      ts: "2026-03-20T15:00:00.000Z",
    }
    expect(decodeChangeEnvelope(base)).toMatchObject({
      ok: false,
      reason: "missing_data",
    })
    expect(decodeChangeEnvelope({ ...base, entity: "nope" })).toMatchObject({
      ok: false,
      reason: "header",
    })
    expect(decodeChangeEnvelope({ ...base, v: 2 })).toMatchObject({
      ok: false,
      reason: "header",
    })
  })

  it("keeps opId and actorId for own-write echo detection (ADR-017)", () => {
    const r = decodeChangeEnvelope(
      wireEnvelope("comment", wireComment(), { opId: "op-1", actorId: "u-1" })
    )
    expect(r.ok && r.change).toMatchObject({ opId: "op-1", actorId: "u-1" })
  })
})

describe("sync changes page (recorded fixture)", () => {
  it("applies the good changes and reports the bad ones without failing the page", () => {
    const r = decodeSyncChanges(page)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.changes.map((c) => `${c.entity}:${c.op}`)).toEqual([
      "match:upsert",
      "scoutEntry:upsert",
      "comment:delete",
    ])
    // 🚀 isn't an allowed reaction; futureEntity is unknown to this app version
    expect(r.value.rejected).toEqual([
      { index: 3, reason: "data" },
      { index: 4, reason: "header" },
    ])
    expect(r.value.cursors.reaction).toBe("c-984")
    const match = r.value.changes[0]
    expect(match?.entity === "match" && match.record?.predictedTime).toBe(
      Date.UTC(2026, 2, 20, 16, 8)
    )
  })
})

describe("meta, session and problems", () => {
  it("turns capabilities into a closed set: missing = false, unknown ignored", () => {
    const r = decodeMeta(meta)
    expect(r.ok && r.value.capabilities).toEqual({
      mqttRpc: true,
      readMarkers: true,
      batchPush: false,
      restore: false,
      guestLogin: false,
      matchPush: false,
      reactions: false,
      demoSeed: false,
      changeStream: false,
    })
  })

  it("decodes a session; deviceId is null when the backend omits it (PV-3)", () => {
    const r = decodeSession(login)
    expect(r.ok && r.value).toMatchObject({
      user: { role: "scouter", teamNumber: 2276 },
      eventKey: null,
      deviceId: null,
      accessExpiresAt: Date.UTC(2026, 9, 3, 18, 15),
    })
  })

  it("gives a stable code for non-problem error bodies", () => {
    expect(decodeProblem(502, "<html>Bad gateway</html>")).toEqual({
      status: 502,
      code: "http_502",
    })
    expect(decodeProblem(409, { status: 409, code: "rev_conflict" }).code).toBe(
      "rev_conflict"
    )
  })
})

describe("backend drift is fixed in one adapter (ADR-071, Phase 1 gate)", () => {
  // Planted: the backend renamed team.nickname → team.teamName.
  const drifted = {
    id: "254",
    rev: 1,
    updatedAt: "2026-03-20T15:00:00.000Z",
    teamNumber: 254,
    teamName: "The Cheesy Poofs",
  }

  it("fails validation without an adapter fix", () => {
    expect(decodeRecord("team", drifted).ok).toBe(false)
  })

  it("decodes once only the team adapter normalizes the renamed field", () => {
    const fixed = {
      ...ENTITY_ADAPTERS,
      team: {
        ...teamAdapter,
        normalize: ({ teamName, ...rest }: Record<string, unknown>) => ({
          ...rest,
          nickname: teamName,
        }),
      },
    }
    const r = decodeRecord("team", drifted, fixed)
    expect(r.ok && r.value.nickname).toBe("The Cheesy Poofs")
  })
})
