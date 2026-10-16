// FRC alliance selection rules, ported from the app (features/alliance-selection/utils/
// selection-rules.ts) so the live board on the server and the client's sims agree: captains from
// the rankings, serpentine order, a picked lower captain moves everyone below up and seed 8
// refills from the rankings, a team that declined can't be picked.

export interface Alliance {
  seed: number
  captain: number | null
  picks: number[]
}

export interface BoardState {
  alliances: Alliance[]
  declined: number[]
}

export type LocalAction = { kind: "pick"; seed: number; team: number } | { kind: "decline"; team: number }

export const ALLIANCES = 8
export const PICKS_PER_ALLIANCE = 2

export type RuleError = "already-placed" | "declined" | "own-captain" | "full" | "no-captain"

export function initialBoard(ranked: readonly number[]): BoardState {
  return {
    alliances: Array.from({ length: ALLIANCES }, (_, i) => ({
      seed: i + 1,
      captain: ranked[i] ?? null,
      picks: [],
    })),
    declined: [],
  }
}

export function applyAction(
  b: BoardState,
  action: LocalAction,
  ranked: readonly number[]
): { ok: true; board: BoardState } | { ok: false; error: RuleError } {
  if (action.kind === "decline") {
    if (b.declined.includes(action.team)) return { ok: true, board: b }
    if (b.alliances.some((a) => a.picks.includes(action.team))) return { ok: false, error: "already-placed" }
    return { ok: true, board: { ...b, declined: [...b.declined, action.team] } }
  }
  const target = b.alliances.find((a) => a.seed === action.seed)
  if (!target?.captain) return { ok: false, error: "no-captain" }
  if (target.captain === action.team) return { ok: false, error: "own-captain" }
  if (target.picks.length >= PICKS_PER_ALLIANCE) return { ok: false, error: "full" }
  if (b.declined.includes(action.team)) return { ok: false, error: "declined" }
  if (b.alliances.some((a) => a.picks.includes(action.team))) return { ok: false, error: "already-placed" }

  const alliances = b.alliances.map((a) => ({ ...a, picks: [...a.picks] }))
  const captainOf = alliances.find((a) => a.captain === action.team)
  if (captainOf) {
    if (captainOf.seed < action.seed) return { ok: false, error: "already-placed" }
    for (let i = captainOf.seed - 1; i < alliances.length - 1; i++) {
      const here = alliances[i]
      const next = alliances[i + 1]
      if (here && next) {
        here.captain = next.captain
        here.picks = next.picks
      }
    }
    const last = alliances[alliances.length - 1]
    if (last) {
      const placed = new Set([
        action.team,
        ...alliances.slice(0, -1).flatMap((a) => [...(a.captain ? [a.captain] : []), ...a.picks]),
      ])
      last.picks = []
      last.captain = ranked.find((t) => !placed.has(t)) ?? null
    }
  }
  alliances.find((a) => a.seed === action.seed)?.picks.push(action.team)
  return { ok: true, board: { alliances, declined: b.declined } }
}

export function replay(ranked: readonly number[], actions: readonly LocalAction[]): BoardState {
  let b = initialBoard(ranked)
  for (const a of actions) {
    const r = applyAction(b, a, ranked)
    if (r.ok) b = r.board
  }
  return b
}
