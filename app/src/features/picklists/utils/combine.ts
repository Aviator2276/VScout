// The combined picklist (scout-tab.md A, P3): several people's lists merged on read (ADR-042).
// Average rank: mean position over the lists that include the team (more lists first on ties).
// Borda: a team at position p in a list of n gets n − p + 1 points; more points first.
// Lists with purpose "dnp" don't rank; they flag teams ("DNP by 2 people").

export interface SourceList {
  id: string
  owner: string
  purpose: string
  /** team numbers in order */
  teams: ReadonlyArray<number>
  reasons?: ReadonlyMap<number, string>
  /** the admin-followed list counts double when weighted */
  followed?: boolean
}

export interface CombinedRow {
  teamNumber: number
  /** 1-based position in the result */
  position: number
  meanRank: number
  min: number
  max: number
  /** how many ranking lists include the team */
  count: number
  score: number
  dnp: number
  reasons: ReadonlyArray<{ owner: string; text: string }>
}

export type CombineMethod = "average-rank" | "borda"

export function combineLists(
  lists: ReadonlyArray<SourceList>,
  method: CombineMethod,
  opts: { weightFollowed?: boolean } = {}
): Array<CombinedRow> {
  const rows = new Map<
    number,
    {
      ranks: Array<number>
      weights: number
      weighted: number
      score: number
      dnp: number
      reasons: Array<{ owner: string; text: string }>
    }
  >()
  const get = (team: number) => {
    let r = rows.get(team)
    if (!r) {
      r = { ranks: [], weights: 0, weighted: 0, score: 0, dnp: 0, reasons: [] }
      rows.set(team, r)
    }
    return r
  }
  for (const list of lists) {
    const isDnp = list.purpose === "dnp"
    const w = opts.weightFollowed && list.followed ? 2 : 1
    list.teams.forEach((team, i) => {
      const r = get(team)
      const reason = list.reasons?.get(team)
      if (reason) r.reasons.push({ owner: list.owner, text: reason })
      if (isDnp) {
        r.dnp++
        return
      }
      const position = i + 1
      r.ranks.push(position)
      r.weights += w
      r.weighted += position * w
      r.score += (list.teams.length - position + 1) * w
    })
  }
  const out: Array<Omit<CombinedRow, "position">> = []
  for (const [teamNumber, r] of rows) {
    if (r.ranks.length === 0) continue
    out.push({
      teamNumber,
      meanRank: Math.round((r.weighted / r.weights) * 100) / 100,
      min: Math.min(...r.ranks),
      max: Math.max(...r.ranks),
      count: r.ranks.length,
      score: r.score,
      dnp: r.dnp,
      reasons: r.reasons,
    })
  }
  out.sort((a, b) =>
    method === "borda"
      ? b.score - a.score ||
        a.meanRank - b.meanRank ||
        a.teamNumber - b.teamNumber
      : a.meanRank - b.meanRank ||
        b.count - a.count ||
        a.teamNumber - b.teamNumber
  )
  return out.map((r, i) => ({ ...r, position: i + 1 }))
}

/** Position deltas against another list (compare mode): + moved up in mine, − down, null = absent. */
export function compareDeltas(
  mine: ReadonlyArray<number>,
  other: ReadonlyArray<number>
): Map<number, number | null> {
  const pos = new Map(other.map((t, i) => [t, i]))
  return new Map(
    mine.map((t, i) => {
      const o = pos.get(t)
      return [t, o === undefined ? null : o - i]
    })
  )
}
