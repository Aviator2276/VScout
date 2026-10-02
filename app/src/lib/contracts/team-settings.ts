// teamSettings singleton (global, id 'team'): our team number, admin-set (R2-14, ADR-065).
import { z } from "zod"
import { teamNumber, wireServerMeta } from "./primitives"

export const wireTeamSettings = z.looseObject({
  ...wireServerMeta,
  id: z.literal("team"),
  teamNumber: teamNumber.nullable().optional(),
})
export type WireTeamSettings = z.infer<typeof wireTeamSettings>

export const putTeamSettingsRequest = z.object({
  baseRev: z.number().int().min(1),
  record: z.object({ teamNumber: teamNumber.nullable() }),
})
