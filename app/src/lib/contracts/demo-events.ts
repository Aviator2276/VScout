// Shared demo events (features/admin.md AD7a, http-api-contract §2.6b): an admin asks the server to
// generate a made-up event in the middle of qualifications. Behind `capabilities.demoSeed`; the
// generated records reach every device through the normal change feed.
import { z } from "zod"
import { eventKey } from "./primitives"

export const DEMO_LIMITS = {
  teams: { min: 12, max: 60 },
  seed: { min: 1, max: 999_999 },
} as const

export const demoEventOptions = z.object({
  seed: z.number().int().min(DEMO_LIMITS.seed.min).max(DEMO_LIMITS.seed.max),
  teams: z.number().int().min(DEMO_LIMITS.teams.min).max(DEMO_LIMITS.teams.max),
  playedPercent: z.number().int().min(0).max(100),
  coveragePercent: z.number().int().min(0).max(100),
})
export type DemoEventOptions = z.infer<typeof demoEventOptions>

export const demoEventCreated = z.looseObject({
  eventKey,
  counts: z.record(z.string(), z.number()).default({}),
})
export type DemoEventCreated = z.infer<typeof demoEventCreated>
