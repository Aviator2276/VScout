// Wire schemas for client-written records, mirrored from app/src/lib/contracts. Unknown keys are kept
// (looseObject) so a newer app's fields survive. Game payloads (`data`) stay opaque here.
import { z } from "zod"

export const isoDateTime = z.iso.datetime({ offset: true })
export const recordId = z.string().min(1).max(64)
export const eventKey = z.string().regex(/^\d{4}[a-z0-9]+$/, "event key like 2026casj")
export const matchKey = z
  .string()
  .regex(/^\d{4}[a-z0-9]+_(qm|ef|qf|sf|f)\d+(m\d+)?$/, "match key like 2026casj_qm12")
export const teamNumber = z.number().int().positive().max(99999)
export const role = z.enum(["admin", "scouter", "guest"])
export type Role = z.infer<typeof role>

const ownedMeta = {
  id: recordId,
  rev: z.number().int().min(1),
  updatedAt: isoDateTime,
  eventKey,
  authorId: recordId,
  createdAt: isoDateTime,
  updatedBy: recordId.optional(),
}

const gamePayload = {
  gameId: z.string().min(1).max(40),
  schemaVersion: z.number().int().min(1),
  data: z.record(z.string(), z.unknown()),
}

export const stationId = z.enum(["red1", "red2", "red3", "blue1", "blue2", "blue3"])

export const scoutEntry = z.looseObject({
  ...ownedMeta,
  ...gamePayload,
  matchKey,
  teamNumber,
  station: stationId,
  scouterLevel: z.enum(["new", "experienced"]),
  tags: z.array(z.string()).default([]),
  validation: z.array(z.object({ fieldId: z.string(), tba: z.unknown(), ours: z.unknown() })).optional(),
})

const robotProfile = z.looseObject({
  drivetrain: z.string().max(40),
  widthIn: z.number().positive().optional(),
  lengthIn: z.number().positive().optional(),
  weightLb: z.number().positive().optional(),
  notes: z.string().max(2000).optional(),
})

export const pitScouting = z.looseObject({
  ...ownedMeta,
  ...gamePayload,
  teamNumber,
  robot: robotProfile,
  photos: z.array(recordId).max(50).default([]),
})

export const postScouting = z.looseObject({ ...ownedMeta, ...gamePayload, teamNumber })

export const allianceRank = z.looseObject({
  ...ownedMeta,
  matchKey,
  alliance: z.enum(["red", "blue"]),
  ranks: z.record(z.string(), z.array(teamNumber).length(3)),
  extras: z.record(z.string(), z.unknown()).default({}),
})

export const comment = z.looseObject({
  ...ownedMeta,
  teamNumber,
  matchKey: matchKey.nullable().optional(),
  body: z.string().min(1).max(4000),
  tags: z.array(z.string()).default([]),
  parentId: recordId.nullable().optional(),
  visibility: z.enum(["team", "private"]).default("team"),
})

export const channelId = z
  .string()
  .regex(/^(event:\d{4}[a-z0-9]+|dm:[^:]+:[^:]+)$/, "event:<eventKey> or dm:<a>:<b>")

export const message = z.looseObject({
  ...ownedMeta,
  channelId,
  kind: z.enum(["message", "announcement"]),
  body: z.string().min(1).max(4000),
  priority: z.enum(["normal", "urgent"]).default("normal"),
  replyToId: recordId.nullable().optional(),
  refs: z.object({ teamNumber: teamNumber.optional(), matchKey: matchKey.optional() }).optional(),
})

export const REACTION_EMOJI = ["👍", "👎", "❤️", "🎉", "😂", "😮", "👀"] as const
export const reaction = z.looseObject({
  ...ownedMeta,
  targetType: z.enum(["message", "announcement"]),
  targetId: recordId,
  emoji: z.enum(REACTION_EMOJI),
})

export const picklist = z.looseObject({
  ...ownedMeta,
  ownerId: recordId,
  name: z.string().min(1).max(80),
  purpose: z.enum(["first", "second", "dnp", "custom"]),
  notes: z.string().max(2000).optional(),
  ballot: z.boolean().optional(),
  master: z.boolean().optional(),
})

export const picklistEntry = z.looseObject({
  ...ownedMeta,
  picklistId: recordId,
  teamNumber,
  rank: z.string().min(1).max(200),
  reason: z.string().max(500).optional(),
  reasonTags: z.array(z.string()).optional(),
  section: z.string().optional(),
})

export const GUEST_CODE_RE = /^[2-9A-HJ-NP-Z]{6}$/

export const eventSettingsRecord = z.looseObject({
  followedPicklistId: recordId.nullable().optional(),
  scoutingOpen: z.boolean().optional(),
  guestAccess: z
    .object({
      enabled: z.boolean(),
      code: z
        .string()
        .transform((s) => s.trim().toUpperCase())
        .pipe(z.string().regex(GUEST_CODE_RE, "6 characters from the guest-code alphabet"))
        .nullable()
        .optional(),
    })
    .optional(),
  metricWeights: z.record(z.string(), z.number()).optional(),
  recommender: z.record(z.string(), z.unknown()).optional(),
  gameOverrides: z.unknown().optional(),
  postScouting: z.looseObject({ openEarly: z.boolean() }).optional(),
  assignmentPlanId: recordId.nullable().optional(),
  notes: z.string().max(10_000).optional(),
})

export const boardAction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pick"), seed: z.number().int().min(1).max(8), team: teamNumber }),
  z.object({ kind: z.literal("decline"), team: teamNumber }),
  z.object({ kind: z.literal("undo"), actionId: recordId }),
  z.object({ kind: z.literal("reset") }),
  z.object({ kind: z.literal("setStatus"), status: z.enum(["notStarted", "inProgress", "done"]) }),
  z.object({ kind: z.literal("lock") }),
  z.object({ kind: z.literal("unlock") }),
])
export type BoardAction = z.infer<typeof boardAction>

export const boardActionRequest = z.object({
  id: recordId,
  baseRev: z.number().int().min(1),
  action: boardAction,
})
