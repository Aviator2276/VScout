// ApiTransport over MQTT 5 RPC (ADR-063). Same method, path, headers, statuses and bodies as HTTP.
import type { Clock } from "@/lib/clock"
import type { IdGen } from "@/lib/ids"
import { RpcError } from "@/lib/mqtt/rpc-channel"
import type { RpcChannel } from "@/lib/mqtt/rpc-channel"
import { TransportError, lowerHeaders } from "./api-transport"
import type { ApiRequest, ApiResponse, ApiTransport } from "./api-transport"

export interface MqttRpcTransportOptions {
  channel: () => RpcChannel | null
  ids: IdGen
  clock?: Clock
  /** /meta capabilities.mqttRpc AND this tab is the MQTT leader (mqtt.md §9.4) */
  enabled: () => boolean
}

/** Requests above this go over HTTP (mqtt.md §9.8). */
export const MAX_RPC_REQUEST_BYTES = 256 * 1024

function problemCode(body: unknown): unknown {
  return typeof body === "object" && body !== null && "code" in body
    ? body.code
    : undefined
}

export function createMqttRpcTransport(
  opts: MqttRpcTransportOptions
): ApiTransport {
  const now = () => (opts.clock ?? { now: () => Date.now() }).now()
  return {
    id: "mqtt",
    isAvailable: () => opts.enabled() && (opts.channel()?.isReady() ?? false),
    async send(req: ApiRequest, timeoutMs: number): Promise<ApiResponse> {
      const channel = opts.channel()
      if (!channel || !opts.enabled())
        throw new TransportError("mqtt", "not-ready")
      const rpc = {
        v: 1 as const,
        id: opts.ids.newId(), // one per attempt; Idempotency-Key stays in headers
        method: req.method,
        path: req.path,
        ...(req.query ? { query: req.query } : {}),
        headers: req.headers,
        ...(req.body === undefined ? {} : { body: req.body }),
      }
      if (JSON.stringify(rpc).length > MAX_RPC_REQUEST_BYTES)
        throw new TransportError("mqtt", "too-large")
      const started = now()
      try {
        const res = await channel.request(rpc, timeoutMs)
        const body = res.body ?? null
        // the server's answer when a response wouldn't fit in one packet: retry over HTTP
        if (res.status === 413 && problemCode(body) === "rpc_too_large")
          throw new TransportError("mqtt", "too-large")
        return {
          status: res.status,
          headers: lowerHeaders(res.headers),
          body,
          transport: "mqtt",
          latencyMs: now() - started,
        }
      } catch (error) {
        if (error instanceof TransportError) throw error
        throw new TransportError(
          "mqtt",
          error instanceof RpcError ? error.kind : "network"
        )
      }
    },
  }
}
