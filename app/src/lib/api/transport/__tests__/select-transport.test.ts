import { describe, expect, it } from "vitest"
import type { RequestClass } from "../api-transport"
import {
  BASE_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
  TransportHealth,
  selectTransports,
} from "../select-transport"
import type { SelectInput, TransportMode } from "../select-transport"

const healthy = () => new TransportHealth().snapshot()
const pick = (
  cls: RequestClass,
  mode: TransportMode,
  o: Partial<SelectInput> = {}
) =>
  selectTransports({
    cls,
    mode,
    rpcReady: true,
    httpSlow: false,
    health: healthy(),
    now: 0,
    ...o,
  })

describe("selectTransports (mqtt.md §9.5 table)", () => {
  it.each([
    ["auth", "auto", ["http"]],
    ["media", "prefer-mqtt", ["http"]],
    ["write", "auto", ["mqtt", "http"]],
    ["live", "auto", ["mqtt", "http"]],
    ["delta", "auto", ["mqtt", "http"]],
    ["bootstrap", "auto", ["http", "mqtt"]],
    ["write", "http-only", ["http"]],
    ["bootstrap", "prefer-mqtt", ["mqtt", "http"]],
  ] as const)("%s in %s mode → %j", (cls, mode, expected) => {
    expect(pick(cls, mode)).toEqual(expected)
  })

  it("uses HTTP only when RPC isn't ready (no capability, disconnected, follower tab)", () => {
    expect(pick("write", "prefer-mqtt", { rpcReady: false })).toEqual(["http"])
  })

  it("sends bootstrap over RPC first when HTTP is slow", () => {
    expect(pick("bootstrap", "auto", { httpSlow: true })).toEqual([
      "mqtt",
      "http",
    ])
  })

  it("tries a degraded transport only as the fallback", () => {
    const h = new TransportHealth()
    h.recordFailure("mqtt", 0)
    h.recordFailure("mqtt", 0)
    expect(pick("write", "auto", { health: h.snapshot(), now: 1000 })).toEqual([
      "http",
      "mqtt",
    ])
    // after the cooldown the next request probes it as primary again
    expect(
      pick("write", "auto", { health: h.snapshot(), now: BASE_COOLDOWN_MS + 1 })
    ).toEqual(["mqtt", "http"])
  })
})

describe("TransportHealth (§9.7)", () => {
  it("degrades after two failures, doubles the cooldown when the probe fails, caps at 10 min", () => {
    const h = new TransportHealth()
    h.recordFailure("http", 0)
    expect(h.snapshot().http.cooldownUntil).toBe(0)
    h.recordFailure("http", 0)
    expect(h.snapshot().http.cooldownUntil).toBe(BASE_COOLDOWN_MS)
    let now = BASE_COOLDOWN_MS
    for (let i = 0; i < 6; i++) {
      now = h.snapshot().http.cooldownUntil
      h.recordFailure("http", now)
    }
    expect(h.snapshot().http.cooldownMs).toBe(MAX_COOLDOWN_MS)
  })

  it("a success clears the counters; reset() clears everything", () => {
    const h = new TransportHealth()
    h.recordFailure("mqtt", 0)
    h.recordFailure("mqtt", 0)
    h.recordSuccess("mqtt", 50)
    expect(h.snapshot().mqtt).toMatchObject({
      consecutiveFailures: 0,
      cooldownUntil: 0,
      ewmaLatencyMs: 50,
    })
    h.recordFailure("http", 0)
    h.reset()
    expect(h.snapshot().http.consecutiveFailures).toBe(0)
  })

  it("flags slow HTTP from the latency average", () => {
    const h = new TransportHealth()
    expect(h.httpSlow()).toBe(false)
    for (let i = 0; i < 20; i++) h.recordSuccess("http", 5000)
    expect(h.httpSlow()).toBe(true)
  })
})
