// FRC alliance selection rules (scout-tab.md B): captains from the rankings, serpentine order
// (round 1: seeds 1→8, round 2: 8→1), a captain picked by a higher seed is replaced by moving
// everyone below up and filling seed 8 from the rankings, and a team that declines can't be picked
// again (it may still be a captain). The live board's server applies the same rules; the client
// uses them for personal sims and to show who's picking.

export interface Alliance {
  seed: number
  captain: number | null
  picks: Array<number>
}

export interface BoardState {
  alliances: Array<Alliance>
  declined: Array<number>
}

export type LocalAction =
  | { kind: "pick"; seed: number; team: number }
  | { kind: "decline"; team: number }

export const ALLIANCES = 8
export const PICKS_PER_ALLIANCE = 2

/** Captains are the top ranked teams that aren't already placed. */
export function initialBoard(ranked: ReadonlyArray<number>): BoardState {
  return {
    alliances: Array.from({ length: ALLIANCES }, (_, i) => ({
      seed: i + 1,
      captain: ranked[i] ?? null,
      picks: [],
    })),
    declined: [],
  }
}

export function placedTeams(b: BoardState): Set<number> {
  return new Set(
    b.alliances.flatMap((a) => [...(a.captain ? [a.captain] : []), ...a.picks])
  )
}

/** The seed whose turn it is, or null when selection is complete. */
export function nextPicker(
  b: BoardState,
  picks = PICKS_PER_ALLIANCE
): { seed: number; round: number } | null {
  for (let round = 1; round <= picks; round++) {
    const order =
      round % 2 === 1
        ? b.alliances.map((a) => a.seed)
        : [...b.alliances].reverse().map((a) => a.seed)
    for (const seed of order) {
      const a = b.alliances.find((x) => x.seed === seed)
      if (a?.captain && a.picks.length < round) return { seed, round }
    }
  }
  return null
}

/** Teams that can still be picked: not placed, not declined, in ranking order. */
export function availableTeams(
  b: BoardState,
  ranked: ReadonlyArray<number>
): Array<number> {
  const placed = placedTeams(b)
  const declined = new Set(b.declined)
  return ranked.filter((t) => !placed.has(t) && !declined.has(t))
}

export type RuleError =
  "already-placed" | "declined" | "own-captain" | "full" | "no-captain"

/** Applies one action; returns the new board or why it isn't allowed. */
export function applyAction(
  b: BoardState,
  action: LocalAction,
  ranked: ReadonlyArray<number>
): { ok: true; board: BoardState } | { ok: false; error: RuleError } {
  if (action.kind === "decline") {
    if (b.declined.includes(action.team)) return { ok: true, board: b }
    if (b.alliances.some((a) => a.picks.includes(action.team)))
      return { ok: false, error: "already-placed" }
    return { ok: true, board: { ...b, declined: [...b.declined, action.team] } }
  }
  const target = b.alliances.find((a) => a.seed === action.seed)
  if (!target?.captain) return { ok: false, error: "no-captain" }
  if (target.captain === action.team) return { ok: false, error: "own-captain" }
  if (target.picks.length >= PICKS_PER_ALLIANCE)
    return { ok: false, error: "full" }
  if (b.declined.includes(action.team)) return { ok: false, error: "declined" }
  if (b.alliances.some((a) => a.picks.includes(action.team)))
    return { ok: false, error: "already-placed" }

  const alliances = b.alliances.map((a) => ({ ...a, picks: [...a.picks] }))
  const captainOf = alliances.find((a) => a.captain === action.team)
  if (captainOf) {
    // a lower seed's captain joins: everyone below moves up, seed 8 refills from the rankings
    if (captainOf.seed < action.seed)
      return { ok: false, error: "already-placed" }
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
        ...alliances
          .slice(0, -1)
          .flatMap((a) => [...(a.captain ? [a.captain] : []), ...a.picks]),
      ])
      last.picks = []
      last.captain = ranked.find((t) => !placed.has(t)) ?? null
    }
  }
  const into = alliances.find((a) => a.seed === action.seed)
  into?.picks.push(action.team)
  return { ok: true, board: { alliances, declined: b.declined } }
}

/** Replays actions from the rankings (personal sims; undo = drop one and replay). */
export function replay(
  ranked: ReadonlyArray<number>,
  actions: ReadonlyArray<LocalAction>
): BoardState {
  let b = initialBoard(ranked)
  for (const a of actions) {
    const r = applyAction(b, a, ranked)
    if (r.ok) b = r.board
  }
  return b
}

/** Teams alliance `seed` may pick: the available ones plus the captains of lower seeds (they move up). */
export function pickableFor(
  b: BoardState,
  seed: number,
  ranked: ReadonlyArray<number>
): Array<number> {
  const lowerCaptains = new Set(
    b.alliances
      .filter(
        (a) => a.seed > seed && a.captain !== null && a.picks.length === 0
      )
      .map((a) => a.captain)
  )
  const available = new Set(availableTeams(b, ranked))
  return ranked.filter((t) => available.has(t) || lowerCaptains.has(t))
}
