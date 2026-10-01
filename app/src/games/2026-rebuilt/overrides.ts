import { z } from "zod"
import type { EventType, GameEventOverrides } from "../types"

// Bonus ranking-point thresholds (owner, ADR-043). Admins override them per event.
export const eventOverridesSchema = z.looseObject({
  rpThresholds: z.object({
    energized: z.number().int().min(0),
    supercharged: z.number().int().min(0),
    traversal: z.number().int().min(0),
  }),
})

const thresholds = (
  energized: number,
  supercharged: number,
  traversal: number
) => ({
  rpThresholds: { energized, supercharged, traversal },
})

export const defaultsByEventType: Record<EventType, GameEventOverrides> = {
  regional: thresholds(100, 360, 50),
  district: thresholds(100, 360, 50),
  dcmp: thresholds(240, 360, 50),
  cmp: thresholds(360, 500, 50),
  offseason: thresholds(100, 360, 50),
}
