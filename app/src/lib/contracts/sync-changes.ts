// GET /sync/changes (http-api-contract §3.1). Envelopes are parsed one by one so a single bad
// record never drops the page.
import { z } from "zod"
import { isoDateTime } from "./primitives"

export const syncScope = z
  .string()
  .regex(
    /^(global|user|event:\d{4}[a-z0-9]+)$/,
    "global, user or event:<eventKey>"
  )
export type SyncScope = z.infer<typeof syncScope>

export const syncChangesResponse = z.looseObject({
  changes: z.array(z.unknown()),
  cursors: z.record(z.string(), z.string()),
  hasMore: z.boolean(),
  serverTime: isoDateTime,
})
export type WireSyncChangesResponse = z.infer<typeof syncChangesResponse>

/** DELETE /{collection}/{id} → tombstone */
export const deleteResponse = z.looseObject({
  id: z.string().min(1),
  rev: z.number().int().min(1),
  deletedAt: isoDateTime,
})
