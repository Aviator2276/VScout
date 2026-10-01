// Outbox retry delay (data-layer §7.7): min(5 min, 1 s × 2^attempts) ± 20% jitter.
export const MAX_RETRY_MS = 5 * 60_000

export function retryDelay(
  attempts: number,
  random: () => number = Math.random
): number {
  const base = Math.min(MAX_RETRY_MS, 1000 * 2 ** Math.max(0, attempts))
  return Math.round(base * (0.8 + 0.4 * random()))
}
