// Per-user picklists (ADR-004/025), votes and the admin's master lists (ADR-080). Entry rank is a fractional index string.
import { z } from "zod"
import { recordId, teamNumber, wireOwnedMeta } from "./primitives"

export const wirePicklist = z.looseObject({
  ...wireOwnedMeta,
  ownerId: recordId,
  name: z.string().min(1).max(80),
  purpose: z.enum(["first", "second", "dnp", "custom"]).catch("custom"),
  notes: z.string().max(2000).optional(),
  /** the owner's vote for this purpose (first/second): the list's order is their ballot (ADR-080) */
  ballot: z.boolean().optional(),
  /** the team's master list for this purpose, built by an admin from the vote (ADR-080) */
  master: z.boolean().optional(),
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
