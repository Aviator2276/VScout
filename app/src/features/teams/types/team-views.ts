// Team detail segments (features/teams.md). Kept apart from the view so the route's validateSearch
// doesn't pull the whole view into the main bundle.
// ADR-078: Pit and Post merged into Overview; old `view=pit|post` links fall back to it.
export const TEAM_VIEWS = ["overview", "matches", "notes"] as const
export type TeamViewKey = (typeof TEAM_VIEWS)[number]
