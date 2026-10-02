// Team detail segments (features/teams.md). Kept apart from the view so the route's validateSearch
// doesn't pull the whole view into the main bundle.
export const TEAM_VIEWS = [
  "overview",
  "matches",
  "notes",
  "pit",
  "post",
] as const
export type TeamViewKey = (typeof TEAM_VIEWS)[number]
