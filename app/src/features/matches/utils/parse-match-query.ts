// How the Matches search box reads a query (matches.md M1 "Search"). Exact for numbers, word-prefix
// for nicknames; every term narrows the list (AND), except a single bare number, which means
// "team N or Qual N".
import { fold } from "@/utils/text-search"

export interface MatchRef {
  compLevel: "qm" | "ef" | "qf" | "sf" | "f"
  setNumber?: number
  matchNumber?: number
}

export interface ParsedMatchQuery {
  /** match tokens ("q12", "sf3"): the match must be one of them */
  matches: Array<MatchRef>
  /** teams that must all be in the match */
  teams: Array<number>
  /** a lone bare number: team N or Qual N */
  teamOrQual: number | null
  /** "us": our team must be in the match (ignored when we have no team number) */
  us: boolean
  /** nickname words (≥ 2 chars): one team in the match matches all of them */
  words: Array<string>
  /** "Showing: …" parts, in query order */
  readAs: Array<string>
  /** "us" typed but no team number is set */
  noTeamNumber: boolean
  empty: boolean
}

const US = new Set(["us", "me", "our", "ours"])

/** "qual 12" → "qual12", so a match token can be typed with a space. */
function joinTokens(q: string): Array<string> {
  return q
    .toLowerCase()
    .replace(
      /\b(qm|q|qual|qf|ef|sf|semi|semifinal|f|final)\s+(\d)/g,
      (_m, a: string, b: string) => `${a}${b}`
    )
    .split(/[\s,]+/)
    .filter(Boolean)
}

function matchToken(t: string): MatchRef | null {
  let m = /^(?:qm|q|qual)(\d{1,3})$/.exec(t)
  if (m) return { compLevel: "qm", matchNumber: Number(m[1]) }
  m = /^(qf|ef|sf|semi|semifinal)(\d{1,2})(?:m(\d{1,2}))?$/.exec(t)
  if (m) {
    const level = m[1] === "qf" || m[1] === "ef" ? m[1] : "sf"
    return {
      compLevel: level,
      setNumber: Number(m[2]),
      ...(m[3] ? { matchNumber: Number(m[3]) } : {}),
    }
  }
  m = /^(?:f|final)(\d{1,2})(?:m(\d{1,2}))?$/.exec(t)
  if (m)
    return m[2]
      ? { compLevel: "f", setNumber: Number(m[1]), matchNumber: Number(m[2]) }
      : { compLevel: "f", matchNumber: Number(m[1]) }
  return null
}

const LEVEL_NAME = {
  qm: "Qual",
  ef: "EF",
  qf: "QF",
  sf: "SF",
  f: "Final",
} as const

function describe(r: MatchRef): string {
  if (r.compLevel === "qm") return `Qual ${r.matchNumber ?? ""}`
  if (r.compLevel === "f")
    return r.setNumber && r.matchNumber
      ? `Final ${r.setNumber}-${r.matchNumber}`
      : `Final ${r.matchNumber ?? ""}`
  return `${LEVEL_NAME[r.compLevel]} ${r.setNumber ?? ""}${r.matchNumber ? `-${r.matchNumber}` : ""}`
}

export function parseMatchQuery(
  query: string | undefined,
  ourTeam: number | null
): ParsedMatchQuery {
  const out: ParsedMatchQuery = {
    matches: [],
    teams: [],
    teamOrQual: null,
    us: false,
    words: [],
    readAs: [],
    noTeamNumber: false,
    empty: true,
  }
  const tokens = joinTokens(query ?? "")
  const numbers: Array<number> = []
  for (const t of tokens) {
    const ref = matchToken(t)
    if (ref) {
      out.matches.push(ref)
      out.readAs.push(describe(ref))
    } else if (/^\d{1,5}$/.test(t)) {
      numbers.push(Number(t))
    } else if (US.has(t)) {
      if (ourTeam === null) out.noTeamNumber = true
      else if (!out.us) {
        out.us = true
        out.readAs.push(`Team ${ourTeam} (us)`)
      }
    } else if (t.length >= 2) {
      out.words.push(fold(t))
      out.readAs.push(`“${t}”`)
    }
  }
  const [only] = numbers
  if (numbers.length === 1 && only !== undefined) {
    out.teamOrQual = only
    out.readAs.push(`Team ${only} or Qual ${only}`)
  } else {
    out.teams = numbers
    for (const n of numbers) out.readAs.push(`Team ${n}`)
  }
  out.empty =
    out.matches.length === 0 &&
    out.teams.length === 0 &&
    out.teamOrQual === null &&
    !out.us &&
    out.words.length === 0
  return out
}

export function refMatches(
  ref: MatchRef,
  m: { compLevel: string; setNumber: number; matchNumber: number }
): boolean {
  if (ref.compLevel !== m.compLevel) return false
  if (ref.compLevel === "qm") return ref.matchNumber === m.matchNumber
  if (ref.setNumber !== undefined && ref.setNumber !== m.setNumber) return false
  if (ref.matchNumber !== undefined && ref.matchNumber !== m.matchNumber)
    return false
  return true
}
