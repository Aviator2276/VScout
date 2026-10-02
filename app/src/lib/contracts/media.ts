// Robot photo metadata (ADR-036/053). The blob uploads over HTTP only (http-api-contract §5.2).
import { z } from "zod"
import { teamNumber, wireOwnedMeta } from "./primitives"

export const wireMediaAsset = z.looseObject({
  ...wireOwnedMeta,
  teamNumber,
  kind: z.literal("robotPhoto"),
  url: z.url(),
  thumbUrl: z.url().nullable().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})
export type WireMediaAsset = z.infer<typeof wireMediaAsset>

/** GET /events/{eventKey}/matches/{matchKey}/videos (http-api-contract §5.1): direct MP4s. */
export const wireMatchVideo = z.looseObject({
  sourceId: z.string().min(1).max(100),
  kind: z.string().max(40).optional(),
  mime: z.string().max(60).default("video/mp4"),
  bytes: z.number().int().nonnegative().optional(),
  quality: z.string().max(20).optional(),
  url: z.url(),
  expiresAt: z.string().optional(),
})
export const wireMatchVideoList = z.object({
  items: z.array(wireMatchVideo).max(20),
})
export type WireMatchVideo = z.infer<typeof wireMatchVideo>
