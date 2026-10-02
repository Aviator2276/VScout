// Search helpers shared by list screens (matches.md, teams.md "Search"): names match by word prefix,
// case- and diacritic-insensitive (Intl.Collator base sensitivity, done by hand so prefixes work).

export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

/** Every word must start some word of the name: "citrus" hits "Citrus Circuits", "ch" misses "Tech". */
export function nameMatches(
  name: string,
  words: ReadonlyArray<string>
): boolean {
  if (words.length === 0) return true
  const parts = fold(name).split(/[^\p{L}\p{N}]+/u)
  return words.every((w) => parts.some((p) => p.startsWith(fold(w))))
}
