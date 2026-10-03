// The /teams URL (teams.md T1 "URL schema"). Metric, external and capability ids are checked against
// the active game, so an old link after a game change falls back instead of erroring.
import { z } from "zod"
import { activeGame } from "@/config/game"
import type { GameDefinition } from "@/games/types"
import { robotProfile } from "@/lib/contracts/scouting"

export const teamsSearchDefaults = {
  sort: "rank",
  window: "all",
  pit: "any",
  coverage: "any",
  capSource: "either",
  ranked: "any",
} as const

export const BASE_SORTS = ["rank", "number", "name", "pit", "scouted"] as const
export type BaseSort = (typeof BASE_SORTS)[number]

const drivetrain = robotProfile.shape.drivetrain.unwrap()

export function teamsSearchFor(game: GameDefinition) {
  const metricId = z
    .string()
    .refine((id) => game.metrics.some((m) => m.id === id))
  const externalId = z
    .string()
    .refine((id) => id in game.scoringKeys.statbotics.teamEvent)
  const capabilityId = z
    .string()
    .refine((id) =>
      game.capabilities.some((c) => c.id === id && c.display === "badge")
    )
  return z.object({
    q: z.string().trim().max(40).optional().catch(undefined),
    sort: z
      .union([z.enum(BASE_SORTS), metricId, externalId])
      .default("rank")
      .catch("rank"),
    dir: z.enum(["asc", "desc"]).optional().catch(undefined),
    window: z.enum(["all", "recent"]).default("all").catch("all"),
    watched: z.boolean().optional().catch(undefined),
    pit: z.enum(["any", "none", "partial", "full"]).default("any").catch("any"),
    coverage: z.enum(["any", "under-target"]).default("any").catch("any"),
    drivetrain: z.array(drivetrain).max(8).optional().catch(undefined),
    cap: z.array(capabilityId).max(8).optional().catch(undefined),
    capSource: z
      .enum(["either", "claimed", "observed"])
      .default("either")
      .catch("either"),
    ranked: z.enum(["any", "top8", "top16"]).default("any").catch("any"),
    sheet: z.enum(["filters", "columns"]).optional().catch(undefined),
  })
}

export const teamsSearch = teamsSearchFor(activeGame)
export type TeamsSearch = z.infer<typeof teamsSearch>

/** Scouter-only filters a guest URL may carry are treated as defaults. */
export function forRole(search: TeamsSearch, canScout: boolean): TeamsSearch {
  if (canScout) return search
  return {
    ...search,
    pit: "any",
    coverage: "any",
    sort:
      search.sort === "scouted" || search.sort === "pit" ? "rank" : search.sort,
  }
}

export function activeFilterCount(s: TeamsSearch): number {
  return [
    s.watched === true,
    s.pit !== "any",
    s.coverage !== "any",
    (s.drivetrain?.length ?? 0) > 0,
    (s.cap?.length ?? 0) > 0,
    s.ranked !== "any",
  ].filter(Boolean).length
}
