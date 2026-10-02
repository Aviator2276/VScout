// fetch with a timeout. Also the only path for auth (cookie), media and the SW rotate call.
import type { Clock } from "@/lib/clock"
import { TransportError, lowerHeaders } from "./api-transport"
import type { ApiRequest, ApiResponse, ApiTransport } from "./api-transport"

export interface HttpTransportOptions {
  /** e.g. https://api.example.org/api/v1 */
  baseUrl: string
  fetch?: typeof fetch
  clock?: Clock
}

export function buildUrl(
  baseUrl: string,
  path: string,
  query?: ApiRequest["query"]
): string {
  const url = new URL(baseUrl.replace(/\/$/, "") + path, "http://placeholder")
  for (const [k, v] of Object.entries(query ?? {}))
    for (const value of Array.isArray(v) ? v : [v])
      url.searchParams.append(k, value)
  // keep a relative base relative (same-origin deployments)
  return /^https?:/.test(baseUrl) ? url.toString() : url.pathname + url.search
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export function createHttpTransport(opts: HttpTransportOptions): ApiTransport {
  const doFetch =
    opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const now = () => (opts.clock ?? { now: () => Date.now() }).now()
  return {
    id: "http",
    isAvailable: () => true,
    async send(req: ApiRequest, timeoutMs: number): Promise<ApiResponse> {
      const started = now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let res: Response
      try {
        res = await doFetch(buildUrl(opts.baseUrl, req.path, req.query), {
          method: req.method,
          headers: {
            ...req.headers,
            ...(req.body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          body: req.body === undefined ? undefined : JSON.stringify(req.body),
          credentials: "include", // the refresh cookie (ADR-035)
          signal: controller.signal,
        })
      } catch (error) {
        throw new TransportError(
          "http",
          controller.signal.aborted ? "timeout" : "network",
          error instanceof Error ? error.message : undefined
        )
      } finally {
        clearTimeout(timer)
      }
      return {
        status: res.status,
        headers: lowerHeaders(res.headers),
        body: await readBody(res),
        transport: "http",
        latencyMs: now() - started,
      }
    },
  }
}
