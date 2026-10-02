// Entry order as fractional keys (fractional-indexing): moving one team writes one row.
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing"

export function keyBetween(
  before: string | null,
  after: string | null
): string {
  return generateKeyBetween(before, after)
}

/** Keys for n new entries appended after `last`. */
export function keysAfter(last: string | null, n: number): Array<string> {
  return generateNKeysBetween(last, null, n)
}

/** The key that puts an item at `to` in `keys` (already sorted), moving it from `from`. */
export function keyForMove(
  keys: ReadonlyArray<string>,
  from: number,
  to: number
): string {
  const rest = keys.filter((_, i) => i !== from)
  return generateKeyBetween(rest[to - 1] ?? null, rest[to] ?? null)
}
