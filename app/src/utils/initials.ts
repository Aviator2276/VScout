// Avatar initials (FX-5): the first letters of the first and last name, or one letter for a
// one-word name. Middle names are skipped ("Mary Ann Smith" → "MS").
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]
  if (!first) return ""
  const last = words.length > 1 ? words[words.length - 1] : undefined
  const letter = (w: string) => Array.from(w)[0] ?? ""
  return (letter(first) + (last ? letter(last) : "")).toUpperCase()
}
