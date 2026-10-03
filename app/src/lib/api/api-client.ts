// The only way to reach the backend API (ADR-063). Adds auth and version headers, picks the
// transport per request, switches once on a transport failure with the same Idempotency-Key,
// refreshes once on 401, and turns non-2xx answers into ApiError. Response bodies are decoded by
// the caller through lib/api/adapters (ADR-071).
import type { Clock } from "@/lib/clock"
import { logger } from "@/lib/logger"
import { approxBytes, describeRequest } from "@/lib/network/describe-request"
import type { NetworkTelemetry } from "@/lib/network/network-telemetry"
import { decodeProblem } from "./adapters/problem-adapter"
import { ApiError, OfflineError, parseRetryAfter } from "./errors"
import { TIMEOUTS, TransportError } from "./transport/api-transport"
import type {
  ApiRequest,
  ApiResponse,
  ApiTransport,
  HttpMethod,
  RequestClass,
  TransportId,
} from "./transport/api-transport"
import { selectTransports } from "./transport/select-transport"
import type {
  TransportHealth,
  TransportMode,
} from "./transport/select-transport"

export interface RequestOptions {
  method: HttpMethod
  path: string
  class: RequestClass
  query?: Record<string, string | Array<string>>
  body?: unknown
  /** the outbox opId: stable across retries AND transports */
  idempotencyKey?: string
  /** auth endpoints carry no bearer token and never trigger a refresh */
  anonymous?: boolean
  headers?: Record<string, string>
  /** measured but not listed under Recent in the Sync sheet (the ping probe) */
  quiet?: boolean
}

/** Requests this small in both directions are latency samples (ping). */
const PING_BYTES = 2_048

export interface ApiClientDeps {
  transports: Record<TransportId, ApiTransport>
  health: TransportHealth
  mode: () => TransportMode
  clock: Clock
  clientVersion: string
  /** current access token (memory only, ADR-024) */
  accessToken: () => string | null
  /** single-flight refresh (lib/auth, track 7); resolves false when the session is gone */
  refresh: () => Promise<boolean>
  /** per-class timeouts; defaults to TIMEOUTS (mqtt.md §9.6) */
  timeouts?: typeof TIMEOUTS
  /** diagnostics: which transport answered, how fast */
  onResponse?: (r: {
    transport: TransportId
    status: number
    latencyMs: number
    cls: RequestClass
  }) => void
  /** the Sync Status notch's telemetry (ADR-079) */
  telemetry?: Pick<NetworkTelemetry, "begin" | "ping">
}

export interface ApiClient {
  request: (opts: RequestOptions) => Promise<ApiResponse>
}

export function createApiClient(deps: ApiClientDeps): ApiClient {
  const buildRequest = (opts: RequestOptions): ApiRequest => {
    const token = opts.anonymous ? null : deps.accessToken()
    return {
      method: opts.method,
      path: opts.path,
      class: opts.class,
      ...(opts.query ? { query: opts.query } : {}),
      ...(opts.body === undefined ? {} : { body: opts.body }),
      headers: {
        "X-Client-Version": deps.clientVersion,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.idempotencyKey
          ? { "Idempotency-Key": opts.idempotencyKey }
          : {}),
        ...opts.headers,
      },
    }
  }

  /** Tries the selected transports in order; only transport failures move to the next one. */
  const send = async (opts: RequestOptions): Promise<ApiResponse> => {
    const now = deps.clock.now()
    const order = selectTransports({
      cls: opts.class,
      mode: deps.mode(),
      rpcReady: deps.transports.mqtt.isAvailable(),
      httpSlow: deps.health.httpSlow(),
      health: deps.health.snapshot(),
      now,
    })
    const failures: Array<string> = []
    const bytesOut = approxBytes(opts.body)
    for (const id of order) {
      const transport = deps.transports[id]
      const end = deps.telemetry?.begin({
        dir: opts.body === undefined ? "down" : "up",
        via: id,
        label: describeRequest(opts.method, opts.path),
        ...(opts.quiet ? { quiet: true } : {}),
      })
      try {
        const res = await transport.send(
          buildRequest(opts),
          (deps.timeouts ?? TIMEOUTS)[opts.class][id]
        )
        if (end) {
          const bytesIn = approxBytes(res.body)
          end({
            ok: res.status < 400,
            bytesOut,
            bytesIn,
            reached: true,
          })
          if (bytesOut < PING_BYTES && bytesIn < PING_BYTES)
            deps.telemetry?.ping(res.latencyMs)
        }
        deps.health.recordSuccess(id, res.latencyMs)
        deps.onResponse?.({
          transport: id,
          status: res.status,
          latencyMs: res.latencyMs,
          cls: opts.class,
        })
        return res
      } catch (error) {
        end?.({ ok: false, bytesOut, bytesIn: 0, reached: false })
        if (!(error instanceof TransportError)) throw error
        deps.health.recordFailure(id, deps.clock.now())
        failures.push(`${id}:${error.kind}`)
        logger.info("api", `transport failure ${opts.method} ${opts.path}`, {
          transport: id,
          kind: error.kind,
        })
      }
    }
    throw new OfflineError(failures)
  }

  return {
    async request(opts: RequestOptions): Promise<ApiResponse> {
      let res = await send(opts)
      if (res.status === 401 && !opts.anonymous && opts.class !== "auth") {
        // token expired: refresh once (single flight in lib/auth), then retry once
        if (await deps.refresh()) res = await send(opts)
      }
      if (res.status >= 200 && res.status < 300) return res
      throw new ApiError(
        decodeProblem(res.status, res.body),
        res.transport,
        parseRetryAfter(res.headers["retry-after"], deps.clock.now())
      )
    },
  }
}
