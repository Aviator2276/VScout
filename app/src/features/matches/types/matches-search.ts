// The /matches URL (features/matches.md M1 "URL schema"). Every key falls back instead of throwing,
// so an old or hand-edited link always renders.
import { z } from "zod"

export const matchesSearchDefaults = {
  level: "all",
  status: "any",
  scouted: "any",
  sort: "schedule",
} as const

export const matchesSearch = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  level: z.enum(["all", "qm", "playoff"]).default("all").catch("all"),
  team: z.coerce.number().int().min(1).max(99999).optional().catch(undefined),
  ours: z.boolean().optional().catch(undefined),
  watched: z.boolean().optional().catch(undefined),
  status: z.enum(["any", "upcoming", "played"]).default("any").catch("any"),
  scouted: z
    .enum(["any", "none", "partial", "full"])
    .default("any")
    .catch("any"),
  video: z.boolean().optional().catch(undefined),
  sort: z
    .enum(["schedule", "recent", "least-scouted"])
    .default("schedule")
    .catch("schedule"),
  sheet: z.enum(["filters"]).optional().catch(undefined),
})

export type MatchesSearch = z.infer<typeof matchesSearch>
export type MatchesSort = MatchesSearch["sort"]

/** Scouter-only keys a guest URL may carry: treated as defaults (matches.md "Role fallbacks"). */
export function forRole(
  search: MatchesSearch,
  canScout: boolean
): MatchesSearch {
  if (canScout) return search
  return {
    ...search,
    scouted: "any",
    sort: search.sort === "least-scouted" ? "schedule" : search.sort,
  }
}

/** How many filters are on (the Filter button badge). Search and sort aren't filters. */
export function activeFilterCount(s: MatchesSearch): number {
  return [
    s.ours === true,
    s.watched === true,
    s.status !== "any",
    s.scouted !== "any",
    s.level !== "all",
    s.team !== undefined,
    s.video === true,
  ].filter(Boolean).length
}
