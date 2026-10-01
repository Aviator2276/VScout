// Author-owned scouting records with game payloads (http-api-contract §0.2, §4.5).
import { z } from "zod"
import {
  matchKey,
  recordId,
  teamNumber,
  wireGamePayload,
  wireOwnedMeta,
} from "./primitives"

export const stationId = z.enum([
  "red1",
  "red2",
  "red3",
  "blue1",
  "blue2",
  "blue3",
])

export const wireScoutEntry = z.looseObject({
  ...wireOwnedMeta,
  ...wireGamePayload,
  matchKey,
  teamNumber,
  station: stationId,
  scouterLevel: z.enum(["new", "experienced"]),
  tags: z.array(z.string()).default([]),
  validation: z
    .array(
      z.object({ fieldId: z.string(), tba: z.unknown(), ours: z.unknown() })
    )
    .optional(),
})
export type WireScoutEntry = z.infer<typeof wireScoutEntry>

export const robotProfile = z.looseObject({
  drivetrain: z
    .enum(["swerve", "tank", "mecanum", "other", "unknown"])
    .catch("unknown"),
  widthIn: z.number().positive().optional(),
  lengthIn: z.number().positive().optional(),
  weightLb: z.number().positive().optional(),
  notes: z.string().max(2000).optional(),
})

export const wirePitScouting = z.looseObject({
  ...wireOwnedMeta,
  ...wireGamePayload,
  teamNumber,
  robot: robotProfile,
  photos: z.array(recordId).default([]),
})
export type WirePitScouting = z.infer<typeof wirePitScouting>

export const wirePostScouting = z.looseObject({
  ...wireOwnedMeta,
  ...wireGamePayload,
  teamNumber,
})
export type WirePostScouting = z.infer<typeof wirePostScouting>

export const wireAllianceRank = z.looseObject({
  ...wireOwnedMeta,
  matchKey,
  alliance: z.enum(["red", "blue"]),
  ranks: z.record(z.string(), z.array(teamNumber).length(3)),
  extras: z.record(z.string(), z.unknown()).default({}),
})
export type WireAllianceRank = z.infer<typeof wireAllianceRank>
