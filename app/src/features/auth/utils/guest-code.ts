// Guest code input rules (ui-patterns §9B, ADR-073): 6 characters from the unambiguous alphabet
// (no 0, O, 1 or I). Typing an ambiguous character shows a hint instead of silently changing it.
export const GUEST_CODE_LENGTH = 6
const ALPHABET = /[A-HJ-NP-Z2-9]/
const AMBIGUOUS = /[0O1I]/

export interface NormalizedCode {
  code: string
  /** the input had 0, O, 1 or I (dropped) */
  ambiguous: boolean
}

export function normalizeGuestCode(raw: string): NormalizedCode {
  const upper = raw.toUpperCase()
  let code = ""
  let ambiguous = false
  for (const ch of upper) {
    if (AMBIGUOUS.test(ch)) ambiguous = true
    else if (ALPHABET.test(ch) && code.length < GUEST_CODE_LENGTH) code += ch
  }
  return { code, ambiguous }
}

export const isCompleteCode = (code: string): boolean =>
  code.length === GUEST_CODE_LENGTH
