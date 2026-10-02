// Coverage of played matches (features/admin.md AD1 card, AD4 tab 1): for each played match, how
// many entries each of the six stations has. Station order: red 1–3, blue 1–3.
export type StationCounts = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
]

export interface PlayedMatch {
  key: string
  label: string
  teams: ReadonlyArray<number | undefined>
}

export interface CoverageRow extends PlayedMatch {
  counts: StationCounts
  missing: number
}

export interface CoverageSummary {
  rows: ReadonlyArray<CoverageRow>
  robots: number
  covered: number
  /** 0–100, null when nothing has been played */
  percent: number | null
}

const ZERO: StationCounts = [0, 0, 0, 0, 0, 0]

export function coverageSummary(
  played: ReadonlyArray<PlayedMatch>,
  counts: ReadonlyMap<string, StationCounts>
): CoverageSummary {
  let robots = 0
  let covered = 0
  const rows = played.map((m) => {
    const c = counts.get(m.key) ?? ZERO
    let missing = 0
    m.teams.forEach((t, i) => {
      if (t === undefined) return
      robots++
      if ((c[i] ?? 0) > 0) covered++
      else missing++
    })
    return { ...m, counts: c, missing }
  })
  return {
    rows,
    robots,
    covered,
    percent: robots === 0 ? null : Math.round((covered / robots) * 100),
  }
}
