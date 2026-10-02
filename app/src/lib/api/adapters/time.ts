// Wire ISO timestamps → epoch ms (the domain stores numbers; data-layer §3).
export function isoToMs(iso: string): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new Error(`Invalid timestamp: ${iso}`)
  return ms
}

export function isoToMsOrNull(iso: string | null | undefined): number | null {
  return iso ? isoToMs(iso) : null
}
