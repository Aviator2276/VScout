// Which transport to try first, and the fallback (mqtt.md §9.5, §9.7). selectTransports is pure
// and table-tested; TransportHealth tracks failures and cooldowns per transport.
import type { RequestClass, TransportId } from "./api-transport"

export type TransportMode = "auto" | "http-only" | "prefer-mqtt"

export interface HealthState {
  consecutiveFailures: number
  cooldownUntil: number
  cooldownMs: number
  ewmaLatencyMs: number | null
}

export interface SelectInput {
  cls: RequestClass
  mode: TransportMode
  /** MqttRpcTransport.isAvailable(): capability, connected, leader */
  rpcReady: boolean
  /** HTTP p95 is above 3 s: bootstrap also prefers RPC (§9.5) */
  httpSlow: boolean
  health: Record<TransportId, HealthState>
  now: number
}

const HTTP_ONLY: ReadonlySet<RequestClass> = new Set(["auth", "media"])

/** Ordered transports to try: the first runs, the second is the fallback. */
export function selectTransports(input: SelectInput): Array<TransportId> {
  const { cls, mode, rpcReady } = input
  if (HTTP_ONLY.has(cls) || mode === "http-only" || !rpcReady) return ["http"]

  let order: Array<TransportId>
  if (mode === "prefer-mqtt") order = ["mqtt", "http"]
  else if (cls === "bootstrap")
    order = input.httpSlow ? ["mqtt", "http"] : ["http", "mqtt"]
  else order = ["mqtt", "http"]

  // a degraded transport is only tried as the fallback (§9.7)
  const degraded = (t: TransportId) => input.health[t].cooldownUntil > input.now
  const [first, second] = order as [TransportId, TransportId]
  return degraded(first) && !degraded(second) ? [second, first] : order
}

export const BASE_COOLDOWN_MS = 60_000
export const MAX_COOLDOWN_MS = 10 * 60_000
const FAILURES_TO_DEGRADE = 2
const SLOW_HTTP_MS = 3_000

function fresh(): HealthState {
  return {
    consecutiveFailures: 0,
    cooldownUntil: 0,
    cooldownMs: BASE_COOLDOWN_MS,
    ewmaLatencyMs: null,
  }
}

export class TransportHealth {
  private state: Record<TransportId, HealthState> = {
    http: fresh(),
    mqtt: fresh(),
  }

  snapshot(): Record<TransportId, HealthState> {
    return { http: { ...this.state.http }, mqtt: { ...this.state.mqtt } }
  }

  recordSuccess(t: TransportId, latencyMs: number): void {
    const s = this.state[t]
    s.consecutiveFailures = 0
    s.cooldownUntil = 0
    s.cooldownMs = BASE_COOLDOWN_MS
    s.ewmaLatencyMs =
      s.ewmaLatencyMs === null
        ? latencyMs
        : 0.8 * s.ewmaLatencyMs + 0.2 * latencyMs
  }

  recordFailure(t: TransportId, now: number): void {
    const s = this.state[t]
    const wasProbe = s.cooldownUntil !== 0 && s.cooldownUntil <= now
    s.consecutiveFailures++
    if (wasProbe) {
      // the probe after a cooldown failed: twice as long, up to 10 min
      s.cooldownMs = Math.min(s.cooldownMs * 2, MAX_COOLDOWN_MS)
      s.cooldownUntil = now + s.cooldownMs
    } else if (
      s.consecutiveFailures >= FAILURES_TO_DEGRADE &&
      s.cooldownUntil === 0
    ) {
      s.cooldownUntil = now + s.cooldownMs
    }
  }

  /** `online` or the app becoming visible: users expect "I got signal, it sent". */
  reset(): void {
    this.state = { http: fresh(), mqtt: fresh() }
  }

  httpSlow(): boolean {
    return (this.state.http.ewmaLatencyMs ?? 0) > SLOW_HTTP_MS
  }
}
