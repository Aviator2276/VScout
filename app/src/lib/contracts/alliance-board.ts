// Shared live alliance board and its online-only actions (ADR-032/064, http-api-contract §4.6).
import { z } from "zod"
import {
  eventKey,
  isoDateTime,
  recordId,
  teamNumber,
  wireServerMeta,
} from "./primitives"

export const boardAction = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pick"),
    seed: z.number().int().min(1).max(8),
    team: teamNumber,
  }),
  z.object({ kind: z.literal("decline"), team: teamNumber }),
  z.object({ kind: z.literal("undo"), actionId: recordId }),
  z.object({ kind: z.literal("reset") }),
  z.object({
    kind: z.literal("setStatus"),
    status: z.enum(["notStarted", "inProgress", "done"]),
  }),
  z.object({ kind: z.literal("lock") }),
  z.object({ kind: z.literal("unlock") }),
])
export type BoardAction = z.infer<typeof boardAction>

export const boardActionRequest = z.object({
  id: recordId,
  baseRev: z.number().int().min(1),
  action: boardAction,
})

export const wireAllianceBoard = z.looseObject({
  ...wireServerMeta,
  id: eventKey,
  eventKey,
  alliances: z
    .array(
      z.object({
        seed: z.number().int().min(1).max(8),
        captain: teamNumber.nullable(),
        picks: z.array(teamNumber).max(3),
      })
    )
    .max(8),
  declined: z.array(teamNumber).default([]),
  status: z.enum(["notStarted", "inProgress", "done"]),
  locked: z.boolean().default(false),
  lockedBy: recordId.nullable().optional(),
  lockedAt: isoDateTime.nullable().optional(),
  history: z
    .array(
      z.looseObject({
        id: recordId,
        actorId: recordId,
        kind: z.string(),
        team: teamNumber.optional(),
        seed: z.number().int().optional(),
        at: isoDateTime,
      })
    )
    .default([]),
})
export type WireAllianceBoard = z.infer<typeof wireAllianceBoard>
