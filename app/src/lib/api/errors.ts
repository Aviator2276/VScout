// Errors from lib/api. Callers switch on `problem.code` (http-api-contract §1).
import type { Problem } from "@/lib/contracts/problem"
import type { TransportId } from "./transport/api-transport"

/** The server answered with a non-2xx status (on either transport). */
export class ApiError extends Error {
  readonly status: number
  readonly problem: Problem
  readonly transport: TransportId
  readonly retryAfterMs: number | null
  constructor(
    problem: Problem,
    transport: TransportId,
    retryAfterMs: number | null
  ) {
    super(`${problem.status} ${problem.code}`)
    this.name = "ApiError"
    this.status = problem.status
    this.problem = problem
    this.transport = transport
    this.retryAfterMs = retryAfterMs
  }
}

/** Every transport failed (offline, blocked, timed out). The request may or may not have arrived. */
export class OfflineError extends Error {
  readonly failures: ReadonlyArray<string>
  constructor(failures: ReadonlyArray<string>) {
    super(`No transport reached the server (${failures.join(", ")})`)
    this.name = "OfflineError"
    this.failures = failures
  }
}

/** Retry-After as delta-seconds or an HTTP date. */
export function parseRetryAfter(
  value: string | undefined,
  now: number
): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const at = Date.parse(value)
  return Number.isNaN(at) ? null : Math.max(0, at - now)
}
