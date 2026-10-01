// Factories for valid WIRE records (what the backend sends). Every factory parses its result with
// the same zod schema the app uses, so a factory can never produce something the app would reject.
// Override any field: wireMatch({ status: "played" }).
import type { z } from "zod"
import { ENTITY_SCHEMAS } from "@/lib/contracts/entities"
import type { EntityName, WireRecord } from "@/lib/contracts/entities"
import { metaResponse } from "@/lib/contracts/meta"
import type { MetaResponse } from "@/lib/contracts/meta"
import { sessionResponse } from "@/lib/contracts/auth"
import type { WireSessionResponse } from "@/lib/contracts/auth"
import { testId, testTime } from "./ids"

export const TEST_EVENT = "2026casj"
export const TEST_GAME = "test-game"

function build<TEntity extends EntityName>(
  entity: TEntity,
  defaults: Record<string, unknown>,
  overrides: Partial<WireRecord<TEntity>> = {}
): WireRecord<TEntity> {
  const schema = ENTITY_SCHEMAS[entity] as unknown as z.ZodType<
    WireRecord<TEntity>
  >
  return schema.parse({ ...defaults, ...overrides })
}

const serverMeta = (id: string) => ({ id, rev: 1, updatedAt: testTime() })
const ownedMeta = (authorId = testId(9000)) => ({
  ...serverMeta(testId()),
  eventKey: TEST_EVENT,
  authorId,
  createdAt: testTime(),
})

export const wireEvent = (o: Partial<WireRecord<"event">> = {}) =>
  build(
    "event",
    {
      ...serverMeta(TEST_EVENT),
      name: "Silicon Valley Regional",
      year: 2026,
      gameId: TEST_GAME,
      eventType: "regional",
      startDate: "2026-03-19",
      endDate: "2026-03-22",
      timezone: "America/Los_Angeles",
    },
    o
  )

export const wireTeam = (o: Partial<WireRecord<"team">> = {}) => {
  const teamNumber = o.teamNumber ?? 254
  return build(
    "team",
    {
      ...serverMeta(String(teamNumber)),
      teamNumber,
      nickname: `Team ${teamNumber}`,
    },
    o
  )
}

export const wireEventTeam = (o: Partial<WireRecord<"eventTeam">> = {}) => {
  const teamNumber = o.teamNumber ?? 254
  return build(
    "eventTeam",
    {
      ...serverMeta(`${TEST_EVENT}_${teamNumber}`),
      eventKey: TEST_EVENT,
      teamNumber,
      rank: 1,
    },
    o
  )
}

export const wireMatch = (o: Partial<WireRecord<"match">> = {}) => {
  const matchNumber = o.matchNumber ?? 1
  return build(
    "match",
    {
      ...serverMeta(`${TEST_EVENT}_qm${matchNumber}`),
      eventKey: TEST_EVENT,
      compLevel: "qm",
      setNumber: 1,
      matchNumber,
      scheduledTime: testTime(matchNumber * 7),
      alliances: {
        red: { teamNumbers: [254, 1678, 971] },
        blue: { teamNumbers: [2276, 604, 846] },
      },
      status: "scheduled",
    },
    o
  )
}

export const wireUser = (o: Partial<WireRecord<"user">> = {}) =>
  build(
    "user",
    {
      ...serverMeta(testId(9000)),
      username: "alex",
      displayName: "Alex",
      role: "scouter",
    },
    o
  )

export const wireScoutEntry = (o: Partial<WireRecord<"scoutEntry">> = {}) =>
  build(
    "scoutEntry",
    {
      ...ownedMeta(),
      gameId: TEST_GAME,
      schemaVersion: 1,
      data: { widgetsScored: 3 },
      matchKey: `${TEST_EVENT}_qm1`,
      teamNumber: 254,
      station: "red1",
      scouterLevel: "new",
    },
    o
  )

export const wireComment = (o: Partial<WireRecord<"comment">> = {}) =>
  build(
    "comment",
    { ...ownedMeta(), teamNumber: 254, body: "Fast drivetrain" },
    o
  )

export const wireMessage = (o: Partial<WireRecord<"message">> = {}) =>
  build(
    "message",
    {
      ...ownedMeta(),
      channelId: `event:${TEST_EVENT}`,
      kind: "message",
      body: "Hello",
    },
    o
  )

export const wireReaction = (o: Partial<WireRecord<"reaction">> = {}) =>
  build(
    "reaction",
    {
      ...ownedMeta(),
      targetType: "announcement",
      targetId: testId(500),
      emoji: "👍",
    },
    o
  )

export const wirePicklist = (o: Partial<WireRecord<"picklist">> = {}) =>
  build(
    "picklist",
    {
      ...ownedMeta(),
      ownerId: testId(9000),
      name: "First pick",
      purpose: "first",
    },
    o
  )

export const wirePicklistEntry = (
  o: Partial<WireRecord<"picklistEntry">> = {}
) =>
  build(
    "picklistEntry",
    { ...ownedMeta(), picklistId: testId(600), teamNumber: 254, rank: "a0" },
    o
  )

export const wireEventSettings = (
  o: Partial<WireRecord<"eventSettings">> = {}
) =>
  build("eventSettings", { ...serverMeta(TEST_EVENT), eventKey: TEST_EVENT }, o)

export const wireTeamSettings = (o: Partial<WireRecord<"teamSettings">> = {}) =>
  build("teamSettings", { ...serverMeta("team"), teamNumber: 2276 }, o)

export const wireUserSettings = (o: Partial<WireRecord<"userSettings">> = {}) =>
  build(
    "userSettings",
    { ...serverMeta(testId(9000)), userId: testId(9000) },
    o
  )

export const wireAllianceBoard = (
  o: Partial<WireRecord<"allianceBoard">> = {}
) =>
  build(
    "allianceBoard",
    {
      ...serverMeta(TEST_EVENT),
      eventKey: TEST_EVENT,
      alliances: Array.from({ length: 8 }, (_, i) => ({
        seed: i + 1,
        captain: null,
        picks: [],
      })),
      status: "notStarted",
    },
    o
  )

export function wireEnvelope<TEntity extends EntityName>(
  entity: TEntity,
  record: WireRecord<TEntity>,
  o: {
    op?: "upsert" | "delete"
    opId?: string
    actorId?: string
    ts?: string
  } = {}
) {
  const r = record as { id: string; rev: number; eventKey?: string | null }
  const op = o.op ?? "upsert"
  return {
    v: 1 as const,
    entity,
    op,
    id: r.id,
    rev: r.rev,
    eventKey: r.eventKey ?? null,
    ts: o.ts ?? testTime(),
    ...(o.actorId ? { actorId: o.actorId } : {}),
    ...(o.opId ? { opId: o.opId } : {}),
    ...(op === "upsert" ? { data: record } : {}),
  }
}

export const wireMeta = (o: Partial<MetaResponse> = {}): MetaResponse =>
  metaResponse.parse({
    apiVersion: 1,
    minClientVersion: "2.0.0-alpha.0",
    serverTime: testTime(),
    activeGameId: TEST_GAME,
    gameSchemaVersions: { [TEST_GAME]: [1] },
    capabilities: {
      mqttRpc: true,
      restore: true,
      guestLogin: true,
      reactions: true,
    },
    ...o,
  })

export const wireSession = (
  o: Partial<WireSessionResponse> = {}
): WireSessionResponse =>
  sessionResponse.parse({
    accessToken: "test-access-token",
    accessExpiresAt: testTime(15),
    refreshExpiresAt: "2026-04-20T15:00:00.000Z",
    user: {
      id: testId(9000),
      username: "alex",
      displayName: "Alex",
      role: "scouter",
      teamNumber: 2276,
    },
    ...o,
  })
