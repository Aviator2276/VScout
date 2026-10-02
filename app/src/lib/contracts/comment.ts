// Comments and personal notes (ADR-040: private = visible to the author only).
import { z } from "zod"
import { matchKey, recordId, teamNumber, wireOwnedMeta } from "./primitives"

export const wireComment = z.looseObject({
  ...wireOwnedMeta,
  teamNumber,
  matchKey: matchKey.nullable().optional(),
  body: z.string().min(1).max(4000),
  tags: z.array(z.string()).default([]),
  parentId: recordId.nullable().optional(),
  visibility: z.enum(["team", "private"]).default("team"),
})
export type WireComment = z.infer<typeof wireComment>
