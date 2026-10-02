// Reference data from TBA (http-api-contract §0.2): events, teams, event teams.
import { z } from "zod"
import { eventKey, isoDateTime, teamNumber, wireServerMeta } from "./primitives"

export const eventType = z.enum([
  "regional",
  "district",
  "dcmp",
  "cmp",
  "offseason",
])

export const wireEvent = z.looseObject({
  ...wireServerMeta,
  id: eventKey,
  name: z.string().min(1),
  year: z.number().int(),
  gameId: z.string().min(1),
  eventType: eventType.catch("regional"),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  timezone: z.string().min(1),
  isDemo: z.boolean().optional(), // admin demo events (AD7a)
})
export type WireEvent = z.infer<typeof wireEvent>

export const wireTeam = z.looseObject({
  ...wireServerMeta,
  id: z.string().regex(/^\d+$/),
  teamNumber,
  nickname: z.string(),
  city: z.string().nullable().optional(),
  rookieYear: z.number().int().nullable().optional(),
})
export type WireTeam = z.infer<typeof wireTeam>

export const wireEventTeam = z.looseObject({
  ...wireServerMeta,
  eventKey,
  teamNumber,
  rank: z.number().int().positive().nullable().optional(),
  record: z
    .object({
      wins: z.number().int(),
      losses: z.number().int(),
      ties: z.number().int(),
    })
    .nullable()
    .optional(),
  rankingPoints: z.number().nullable().optional(),
  pitLocation: z.string().nullable().optional(),
  /** Statbotics/TBA values keyed by the game's scoringKeys; interpreted by the game module */
  stats: z.record(z.string(), z.unknown()).default({}),
  statsUpdatedAt: isoDateTime.nullable().optional(),
})
export type WireEventTeam = z.infer<typeof wireEventTeam>
