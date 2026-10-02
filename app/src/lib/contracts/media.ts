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
