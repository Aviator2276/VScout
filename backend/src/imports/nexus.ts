// FRC Nexus API → live queue status and estimated start times on matches, pit locations on event
// teams, and the pit map (REQUIREMENTS §11). Parsed tolerantly: Nexus fields we don't know are kept
// raw and unknown statuses are reported, never mapped to a default.
import { z } from "zod"
import type { CachedFetcher } from "./http-cache.js"

export const NEXUS_BASE = "https://frc.nexus/api/v1"

const msTime = z.number().nullable().optional()

const nexusMatch = z.looseObject({
  label: z.string(),
  status: z.string().nullable().optional(),
  redTeams: z.array(z.union([z.string(), z.number()]).nullable()).nullable().optional(),
  blueTeams: z.array(z.union([z.string(), z.number()]).nullable()).nullable().optional(),
  times: z
    .looseObject({
      scheduledStartTime: msTime,
      estimatedQueueTime: msTime,
      estimatedOnDeckTime: msTime,
      estimatedOnFieldTime: msTime,
      estimatedStartTime: msTime,
      actualQueueTime: msTime,
      actualOnDeckTime: msTime,
      actualOnFieldTime: msTime,
    })
    .nullable()
    .optional(),
  breakAfter: z.string().nullable().optional(),
})

export const nexusEventSchema = z.looseObject({
  eventKey: z.string().optional(),
  dataAsOfTime: z.number(),
  nowQueuing: z.string().nullable().optional(),
  matches: z.array(nexusMatch).default([]),
})
export type NexusEvent = z.infer<typeof nexusEventSchema>
export type NexusMatch = z.infer<typeof nexusMatch>

/** Nexus status → the app's match status. Undefined means "unknown string": keep raw, report it. */
export function mapNexusStatus(raw: string | null | undefined): "scheduled" | "queuing" | "onField" | undefined {
  if (raw === null || raw === undefined || raw === "") return "scheduled"
  switch (raw.trim().toLowerCase()) {
    case "queuing soon":
      return "scheduled"
    case "now queuing":
    case "on deck":
      return "queuing"
    case "on field":
      return "onField"
    default:
      return undefined
  }
}

/** "Qualification 12" → 2026casj_qm12; playoff and final labels follow TBA's double-elimination keys. */
export function matchKeyForLabel(eventKey: string, label: string): string | null {
  const l = label.trim()
  let m = /^Qualification\s+(\d+)$/i.exec(l)
  if (m) return `${eventKey}_qm${m[1]}`
  m = /^(?:Playoff|Playoffs|Match)\s+(\d+)$/i.exec(l)
  if (m) return `${eventKey}_sf${m[1]}m1`
  m = /^Finals?\s+(\d+)$/i.exec(l)
  if (m) return `${eventKey}_f1m${m[1]}`
  return null
}

const iso = (ms: number | null | undefined) => (typeof ms === "number" && ms > 0 ? new Date(ms).toISOString() : null)

/** Nexus's live part of a match record. */
export function nexusMatchPart(m: NexusMatch): Record<string, unknown> {
  const t = m.times ?? {}
  return {
    predictedTime: iso(t.estimatedStartTime ?? t.estimatedOnFieldTime),
    nexusStatus: m.status ?? null,
    queueTimes: {
      estimatedQueue: iso(t.estimatedQueueTime),
      estimatedOnDeck: iso(t.estimatedOnDeckTime),
      estimatedOnField: iso(t.estimatedOnFieldTime),
      actualQueue: iso(t.actualQueueTime),
      actualOnDeck: iso(t.actualOnDeckTime),
      actualOnField: iso(t.actualOnFieldTime),
    },
  }
}

/** Pits: `{ "254": "A12" }`, or an array of `{ team, pit }`. */
export function parsePits(body: unknown): Map<number, string> {
  const out = new Map<number, string>()
  if (Array.isArray(body)) {
    for (const row of body) {
      if (row && typeof row === "object") {
        const r = row as Record<string, unknown>
        const team = Number(r.team ?? r.teamNumber)
        const pit = r.pit ?? r.address ?? r.location
        if (Number.isInteger(team) && team > 0 && typeof pit === "string" && pit) out.set(team, pit)
      }
    }
  } else if (body && typeof body === "object") {
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      const team = Number(String(k).replace(/^frc/, ""))
      if (Number.isInteger(team) && team > 0 && typeof v === "string" && v) out.set(team, v)
    }
  }
  return out
}

export class NexusClient {
  constructor(
    private http: CachedFetcher,
    private apiKey: string,
    private base = NEXUS_BASE
  ) {}

  private get<T>(path: string) {
    return this.http.getJson<T>("Nexus", `${this.base}${path}`, { "Nexus-Api-Key": this.apiKey }, 15_000)
  }

  event(key: string) {
    return this.get<unknown>(`/event/${key}`)
  }
  pits(key: string) {
    return this.get<unknown>(`/event/${key}/pits`)
  }
  map(key: string) {
    return this.get<unknown>(`/event/${key}/map`)
  }
}
