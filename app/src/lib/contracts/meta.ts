// GET /meta (http-api-contract §1.3, ADR-071). Unknown capability keys are ignored, a missing
// key means "not supported".
import { z } from "zod"
import { isoDateTime } from "./primitives"

export const CAPABILITY_KEYS = [
  "mqttRpc",
  "readMarkers",
  "batchPush",
  "restore",
  "guestLogin",
  "matchPush",
  "reactions",
  "demoSeed",
  /** GET /sync/stream: Server-Sent Events of change envelopes for HTTP-only clients */
  "changeStream",
] as const
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]

export const metaResponse = z.looseObject({
  apiVersion: z.number().int(),
  minClientVersion: z.string().min(1),
  serverTime: isoDateTime,
  activeGameId: z.string().min(1).nullable().optional(),
  gameSchemaVersions: z
    .record(z.string(), z.array(z.number().int()))
    .default({}),
  capabilities: z.record(z.string(), z.boolean()).default({}),
})
export type MetaResponse = z.infer<typeof metaResponse>
