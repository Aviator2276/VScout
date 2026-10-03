// Per-user picklists (ADR-004/025). Entry rank is a fractional index string.
import { z } from "zod"
import { recordId, teamNumber, wireOwnedMeta } from "./primitives"

export const wirePicklist = z.looseObject({
  ...wireOwnedMeta,
  ownerId: recordId,
  name: z.string().min(1).max(80),
  purpose: z.enum(["first", "second", "dnp", "custom"]).catch("custom"),
  notes: z.string().max(2000).optional(),
})
export type WirePicklist = z.infer<typeof wirePicklist>

export const wirePicklistEntry = z.looseObject({
  ...wireOwnedMeta,
  picklistId: recordId,
  teamNumber,
  rank: z.string().min(1),
  reason: z.string().max(500).optional(),
  reasonTags: z.array(z.string()).optional(),
  section: z.string().optional(),
})
export type WirePicklistEntry = z.infer<typeof wirePicklistEntry>
