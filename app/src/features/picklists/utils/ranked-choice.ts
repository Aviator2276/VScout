// The picklist vote (scout-tab.md A.2, ADR-080): every voter's ballot is the order of the list they
// chose as their vote, and the result is ranked by repeated instant runoff. Position 1 is the instant-
// runoff winner over every team; position 2 is the winner once that team is set aside; and so on.
//
// One runoff: each ballot counts for its highest team still in the race. A team with more than half
// of the counting ballots wins. Otherwise the team with the fewest votes is dropped and its ballots
// move to their next choice. Ties for the fewest drop the team with the lower Borda score (n − p + 1
// points per ballot), then the one with fewer first choices, then the higher team number, so the
// result never depends on input order.
//
// Do-not-pick doesn't subtract votes: it only flags rows (dnp), so the admin sees the warning without
// the vote hiding a team most people want (ADR-080).

export interface Ballot {
  voter: string
  /** team numbers, best first */
  teams: ReadonlyArray<number>
}

export interface VoteRow {
  teamNumber: number
  /** 1-based position in the result */
  position: number
  /** the runoff round that decided it (1 = a majority of first choices) */
  round: number
  /** its votes in the deciding round */
  votes: number
  /** ballots still counting in the deciding round */
  of: number
  /** ballots that rank it first */
  firstChoices: number
  /** ballots that include it */
  ballots: number
  /** where each voter placed it (1-based), in ballot order */
  positions: ReadonlyArray<{ voter: string; position: number }>
  /** how many people put it on a do-not-pick list */
  dnp: number
}

export function rankedChoice(
  ballots: ReadonlyArray<Ballot>,
  dnp: ReadonlyMap<number, number> = new Map()
): Array<VoteRow> {
  const borda = new Map<number, number>()
  const first = new Map<number, number>()
  const positions = new Map<
    number,
    Array<{ voter: string; position: number }>
  >()
  for (const b of ballots) {
    const seen = new Set<number>()
    const teams = b.teams.filter((t) => !seen.has(t) && seen.add(t))
    teams.forEach((t, i) => {
      borda.set(t, (borda.get(t) ?? 0) + teams.length - i)
      if (i === 0) first.set(t, (first.get(t) ?? 0) + 1)
      const list = positions.get(t) ?? []
      list.push({ voter: b.voter, position: i + 1 })
      positions.set(t, list)
    })
  }
  const remaining = new Set(borda.keys())
  /** the order teams are dropped in when tied for the fewest votes */
  const weaker = (a: number, b: number) =>
    (borda.get(a) ?? 0) - (borda.get(b) ?? 0) ||
    (first.get(a) ?? 0) - (first.get(b) ?? 0) ||
    b - a

  const out: Array<VoteRow> = []
  while (remaining.size > 0) {
    const won = runoff(ballots, remaining, weaker)
    remaining.delete(won.team)
    out.push({
      teamNumber: won.team,
      position: out.length + 1,
      round: won.round,
      votes: won.votes,
      of: won.of,
      firstChoices: first.get(won.team) ?? 0,
      ballots: positions.get(won.team)?.length ?? 0,
      positions: positions.get(won.team) ?? [],
      dnp: dnp.get(won.team) ?? 0,
    })
  }
  return out
}

function runoff(
  ballots: ReadonlyArray<Ballot>,
  candidates: ReadonlySet<number>,
  weaker: (a: number, b: number) => number
): { team: number; round: number; votes: number; of: number } {
  const active = new Set(candidates)
  for (let round = 1; ; round++) {
    const tally = new Map<number, number>([...active].map((t) => [t, 0]))
    let of = 0
    for (const b of ballots) {
      const choice = b.teams.find((t) => active.has(t))
      if (choice === undefined) continue
      of++
      tally.set(choice, (tally.get(choice) ?? 0) + 1)
    }
    const order = [...tally].sort(([a, va], [b, vb]) => vb - va || weaker(b, a))
    const [top, votes] = order[0] ?? [0, 0]
    if (active.size === 1 || votes * 2 > of)
      return { team: top, round, votes, of }
    const [drop] = order.at(-1) ?? [top]
    active.delete(drop)
  }
}
