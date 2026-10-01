// Full-jitter backoff (mqtt.md §3.3): random(0, min(30 s, 500 ms × 2^attempt)).
export const MAX_BACKOFF_MS = 30_000
const BASE_MS = 500

export function backoff(
  attempt: number,
  random: () => number = Math.random
): number {
  const cap = Math.min(MAX_BACKOFF_MS, BASE_MS * 2 ** Math.max(0, attempt))
  return Math.floor(random() * cap)
}
