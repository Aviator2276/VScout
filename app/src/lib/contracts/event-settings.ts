// eventSettings admin singleton (data-layer §4, features/scout-tab.md S1.7, ADR-043/066/073).
// Invalid nested config falls back to defaults instead of rejecting the whole record.
import { z } from "zod"
import { guestCode } from "./auth"
import { eventKey, isoDateTime, recordId, wireServerMeta } from "./primitives"

export const recommenderConfig = z.looseObject({
  segments: z.number().int().min(1).max(5).default(3),
  targetPerSegment: z.number().int().min(0).max(5).default(1),
  targetScoutersPerSlot: z.number().int().min(1).max(4).default(1),
  maxScoutersPerSlot: z.number().int().min(1).max(6).default(2),
  horizonMatches: z.number().int().min(1).max(20).default(6),
  spreadBand: z.number().min(0).max(100).default(10),
  weights: z
    .looseObject({
      segmentGap: z.number().default(100),
      lastChance: z.number().default(60),
      teamDeficit: z.number().default(10),
      duplicate: z.number().default(-80),
      soonness: z.number().default(-4),
      ourMatch: z.number().default(15),
      watched: z.number().default(5),
    })
    .default({
      segmentGap: 100,
      lastChance: 60,
      teamDeficit: 10,
      duplicate: -80,
      soonness: -4,
      ourMatch: 15,
      watched: 5,
    }),
})
export type RecommenderConfig = z.infer<typeof recommenderConfig>

export const DEFAULT_RECOMMENDER: RecommenderConfig = recommenderConfig.parse(
  {}
)

export const guestAccess = z.object({
  enabled: z.boolean().default(false),
  code: guestCode.nullable().default(null),
  rotatedAt: isoDateTime.nullable().default(null),
})

export const wireEventSettings = z.looseObject({
  ...wireServerMeta,
  id: eventKey,
  eventKey,
  followedPicklistId: recordId.nullable().optional(),
  scoutingOpen: z.boolean().default(true),
  guestAccess: guestAccess.catch({
    enabled: false,
    code: null,
    rotatedAt: null,
  }),
  metricWeights: z.record(z.string(), z.number()).optional(),
  recommender: recommenderConfig.catch(DEFAULT_RECOMMENDER).optional(),
  /** validated by game.eventOverridesSchema at read (ADR-043) */
  gameOverrides: z.unknown().optional(),
  postScouting: z.object({ openEarly: z.boolean().default(false) }).optional(),
  assignmentPlanId: recordId.nullable().optional(),
  notes: z.string().optional(),
})
export type WireEventSettings = z.infer<typeof wireEventSettings>
