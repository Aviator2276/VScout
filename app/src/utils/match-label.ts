// Match names from the TBA key parts (matches.md row anatomy, round-1 criterion 9 "playoff naming").
// Short: "Q12", "SF 3", "F 2". Long (titles, VoiceOver): "Qual 12", "Semifinal 3", "Final 2".
type CompLevel = "qm" | "ef" | "qf" | "sf" | "f"

export interface MatchId {
  compLevel: CompLevel
  setNumber: number
  matchNumber: number
}

const SHORT: Record<CompLevel, string> = {
  qm: "Q",
  ef: "EF",
  qf: "QF",
  sf: "SF",
  f: "F",
}
const LONG: Record<CompLevel, string> = {
  qm: "Qual",
  ef: "Eighthfinal",
  qf: "Quarterfinal",
  sf: "Semifinal",
  f: "Final",
}

/** The number people say: the qual number, the playoff set, or the final's match number. */
function parts(m: MatchId): { main: number; replay: number | null } {
  if (m.compLevel === "qm") return { main: m.matchNumber, replay: null }
  // finals are one set of up to three matches
  if (m.compLevel === "f") return { main: m.matchNumber, replay: null }
  return { main: m.setNumber, replay: m.matchNumber > 1 ? m.matchNumber : null }
}

export function shortMatchLabel(m: MatchId): string {
  const { main, replay } = parts(m)
  const sep = m.compLevel === "qm" ? "" : " "
  return `${SHORT[m.compLevel]}${sep}${main}${replay ? `-${replay}` : ""}`
}

export function longMatchLabel(m: MatchId): string {
  const { main, replay } = parts(m)
  return `${LONG[m.compLevel]} ${main}${replay ? `, Match ${replay}` : ""}`
}

/** "2026casj_qm12" → its parts, or null for a malformed key. */
export function parseMatchKey(key: string): MatchId | null {
  const m = /^\d{4}[a-z0-9]+_(qm|ef|qf|sf|f)(\d+)(?:m(\d+))?$/.exec(key)
  if (!m) return null
  const compLevel = m[1] as CompLevel
  const a = Number(m[2])
  const b = m[3] ? Number(m[3]) : null
  return compLevel === "qm"
    ? { compLevel, setNumber: 1, matchNumber: a }
    : { compLevel, setNumber: a, matchNumber: b ?? 1 }
}

export function isPlayoff(m: Pick<MatchId, "compLevel">): boolean {
  return m.compLevel !== "qm"
}

const LEVEL_ORDER: Record<CompLevel, number> = {
  qm: 0,
  ef: 1,
  qf: 2,
  sf: 3,
  f: 4,
}

/** Schedule order when times are missing: level, then set, then match. */
export function compareMatchIds(a: MatchId, b: MatchId): number {
  return (
    LEVEL_ORDER[a.compLevel] - LEVEL_ORDER[b.compLevel] ||
    a.setNumber - b.setNumber ||
    a.matchNumber - b.matchNumber
  )
}
