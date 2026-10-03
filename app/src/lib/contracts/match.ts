// Match schedule and results (TBA + Nexus). A match is always identified by its TBA key.
import { z } from "zod"
import {
  eventKey,
  isoDateTime,
  matchKey,
  teamNumber,
  wireServerMeta,
} from "./primitives"

export const compLevel = z.enum(["qm", "ef", "qf", "sf", "f"])
export const allianceColor = z.enum(["red", "blue"])

const wireAlliance = z.looseObject({
  teamNumbers: z.array(teamNumber).max(4),
  score: z.number().int().nullable().optional(),
  surrogates: z.array(teamNumber).default([]),
  dqs: z.array(teamNumber).default([]),
})

export const wireMatch = z.looseObject({
  ...wireServerMeta,
  id: matchKey,
  eventKey,
  compLevel,
  setNumber: z.number().int().min(1),
  matchNumber: z.number().int().min(1),
  scheduledTime: isoDateTime.nullable().optional(),
  /** Nexus live estimate; only trusted while fresh (ADR-072) */
  predictedTime: isoDateTime.nullable().optional(),
  predictedAt: isoDateTime.nullable().optional(),
  actualTime: isoDateTime.nullable().optional(),
  alliances: z.object({ red: wireAlliance, blue: wireAlliance }),
  status: z
    .enum(["scheduled", "queuing", "onField", "played"])
    .catch("scheduled"),
  winningAlliance: allianceColor.nullable().optional(),
  scoreBreakdown: z.record(z.string(), z.unknown()).nullable().optional(),
  videoKeys: z.array(z.string()).default([]),
})
export type WireMatch = z.infer<typeof wireMatch>
