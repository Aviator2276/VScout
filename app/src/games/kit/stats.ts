// Small, pure statistics helpers for metrics.

export function mean(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function median(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2
    ? (s[mid] ?? null)
    : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2
}

/** Population standard deviation. */
export function stdev(values: ReadonlyArray<number>): number | null {
  const m = mean(values)
  if (m === null) return null
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)) ?? 0)
}

/** Coefficient of variation; null when the mean is 0 or there's no data. */
export function cv(values: ReadonlyArray<number>): number | null {
  const m = mean(values)
  const s = stdev(values)
  if (m === null || s === null || m === 0) return null
  return s / Math.abs(m)
}

/** The last `n` items by play order (window 'last4'), or all. */
export function windowed<TItem>(
  items: ReadonlyArray<TItem>,
  window: "all" | "last4"
): Array<TItem> {
  return window === "all" ? [...items] : items.slice(-4)
}

export function round(value: number, digits = 3): number {
  const f = 10 ** digits
  return Math.round(value * f) / f
}
