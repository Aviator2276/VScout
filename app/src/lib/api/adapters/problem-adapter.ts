// Error bodies → Problem. A non-problem body (proxy HTML, empty 502) still yields a stable
// `code`, so callers can always switch on it.
import { problem } from "@/lib/contracts/problem"
import type { Problem } from "@/lib/contracts/problem"

export function decodeProblem(status: number, body: unknown): Problem {
  const parsed = problem.safeParse(body)
  if (parsed.success) return parsed.data
  return { status, code: `http_${status}` }
}
