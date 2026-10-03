// GET /events/{eventKey}/pit-map (http-api-contract §5.3): an image and each team's pit rectangle,
// in image pixels.
import { z } from "zod"
import { teamNumber } from "./primitives"

export const wirePitMap = z.looseObject({
  rev: z.number().int().nonnegative(),
  imageUrl: z.url(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  pits: z
    .array(
      z.object({
        teamNumber,
        x: z.number(),
        y: z.number(),
        w: z.number().positive(),
        h: z.number().positive(),
      })
    )
    .max(200),
})
export type WirePitMap = z.infer<typeof wirePitMap>
