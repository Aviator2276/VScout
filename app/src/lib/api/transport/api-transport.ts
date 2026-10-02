// One interface for talking to the backend (ADR-063, systems/mqtt.md §9). Features, lib/sync and
// lib/auth never call fetch or MQTT for API requests; they go through lib/api/api-client.ts.

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

/** Decides transport order and timeouts (mqtt.md §9.5–9.6). */
export type RequestClass =
  "auth" | "media" | "write" | "live" | "delta" | "bootstrap"

export type TransportId = "http" | "mqtt"

export interface ApiRequest {
  method: HttpMethod
  /** relative to /api/v1, e.g. /sync/changes */
  path: string
  query?: Record<string, string | Array<string>>
  headers: Record<string, string>
  body?: unknown
  class: RequestClass
}

export interface ApiResponse {
  status: number
  /** lower-cased names */
  headers: Record<string, string>
  /** parsed JSON, or null for an empty body */
  body: unknown
  transport: TransportId
  latencyMs: number
}

export type TransportFailure =
  | "timeout"
  | "network"
  | "disconnected"
  | "not-ready"
  | "publish-failed"
  | "bad-response"
  | "too-large"

/** A failure of the path, not the server. HTTP statuses are never TransportErrors (§9.6). */
export class TransportError extends Error {
  readonly kind: TransportFailure
  readonly transport: TransportId
  constructor(
    transport: TransportId,
    kind: TransportFailure,
    message?: string
  ) {
    super(message ?? `${transport}: ${kind}`)
    this.name = "TransportError"
    this.transport = transport
    this.kind = kind
  }
}

export interface ApiTransport {
  readonly id: TransportId
  isAvailable: () => boolean
  send: (request: ApiRequest, timeoutMs: number) => Promise<ApiResponse>
}

/** Per-class timeouts in ms (mqtt.md §9.6). */
export const TIMEOUTS: Record<RequestClass, Record<TransportId, number>> = {
  auth: { http: 15_000, mqtt: 15_000 },
  media: { http: 60_000, mqtt: 60_000 },
  write: { http: 15_000, mqtt: 8_000 },
  delta: { http: 15_000, mqtt: 8_000 },
  live: { http: 6_000, mqtt: 4_000 },
  bootstrap: { http: 30_000, mqtt: 20_000 },
}

export function lowerHeaders(
  headers: Iterable<[string, string]> | Record<string, string>
) {
  const entries =
    Symbol.iterator in headers ? [...headers] : Object.entries(headers)
  return Object.fromEntries(entries.map(([k, v]) => [k.toLowerCase(), v]))
}
