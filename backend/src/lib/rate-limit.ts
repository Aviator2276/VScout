// In-memory fixed-window limiter (one API instance per deployment, REQUIREMENTS §1).
import type { Clock } from "./clock.js"
import { problem } from "./problem.js"

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private clock: Clock,
    private limit: number,
    private windowMs: number
  ) {}

  /** Seconds until the key may try again, or 0 when it is under the limit. Does not count. */
  blockedFor(key: string): number {
    const h = this.hits.get(key)
    const now = this.clock.now()
    if (!h || h.resetAt <= now) return 0
    return h.count >= this.limit ? Math.ceil((h.resetAt - now) / 1000) : 0
  }

  hit(key: string): void {
    const now = this.clock.now()
    const h = this.hits.get(key)
    if (!h || h.resetAt <= now) this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
    else h.count++
    if (this.hits.size > 50_000) this.sweep(now)
  }

  reset(key: string): void {
    this.hits.delete(key)
  }

  /** Throws 429 when any key is blocked; otherwise counts a hit on each. */
  consume(...keys: string[]): void {
    this.check(...keys)
    for (const k of keys) this.hit(k)
  }

  check(...keys: string[]): void {
    const wait = Math.max(0, ...keys.map((k) => this.blockedFor(k)))
    if (wait > 0)
      throw problem(429, "rate_limited", { detail: "Too many attempts" }, { "Retry-After": String(wait) })
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k)
  }
}
