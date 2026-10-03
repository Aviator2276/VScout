// Network telemetry and the notch's state (features/sync-status.md S1, S2).
import { describe, expect, it, vi } from "vitest"
import { approxBytes, describeRequest } from "../describe-request"
import {
  PROBE_AFTER_MS,
  attachNetworkMonitor,
  shouldProbe,
} from "../network-monitor"
import {
  bitLoopSeconds,
  deriveNetworkStatus,
  formatBytes,
  formatRate,
  qualityFrom,
} from "../network-status"
import {
  EMPTY_NETWORK,
  HISTORY_MS,
  SAMPLE_MS,
  createNetworkTelemetry,
  smooth,
} from "../network-telemetry"
import type { NetworkSnapshot } from "../network-telemetry"

function clock(start = 1_000_000) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
  }
}

describe("telemetry", () => {
  it("counts transfers in flight per direction and lists them", () => {
    const c = clock()
    const network = createNetworkTelemetry(c.now)
    const endUp = network.begin({
      dir: "up",
      via: "http",
      label: "Save comments",
    })
    const endDown = network.begin({
      dir: "down",
      via: "mqtt",
      label: "Changes",
    })
    expect(network.getSnapshot()).toMatchObject({ activeUp: 1, activeDown: 1 })
    expect(network.getSnapshot().transfers.map((t) => t.label)).toEqual([
      "Changes",
      "Save comments",
    ])
    c.advance(500)
    endUp({ ok: true, bytesOut: 50_000, bytesIn: 100, reached: true })
    endUp({ ok: true, bytesOut: 1, bytesIn: 1, reached: true }) // once only
    endDown({ ok: false, bytesOut: 0, bytesIn: 0, reached: false })
    const s = network.getSnapshot()
    expect(s).toMatchObject({
      activeUp: 0,
      activeDown: 0,
      upBps: 100_000,
      downBps: null,
      outcomes: [true, false],
      answeredAt: c.now(),
    })
    expect(s.transfers.map((t) => [t.outcome, t.bytes, t.ms])).toEqual([
      ["failed", 0, 500],
      ["ok", 50_100, 500],
    ])
  })

  it("measures download speed from the response, and quiet transfers aren't listed", () => {
    const c = clock()
    const network = createNetworkTelemetry(c.now)
    const end = network.begin({
      dir: "down",
      via: "http",
      label: "Status check",
      quiet: true,
    })
    c.advance(1000)
    end({ ok: true, bytesOut: 0, bytesIn: 2_000, reached: true })
    expect(network.getSnapshot()).toMatchObject({
      downBps: 2_000,
      transfers: [],
    })
  })

  it("a reached request without a body in its direction leaves speeds alone", () => {
    const network = createNetworkTelemetry(clock().now)
    network.begin({ dir: "up", via: "http", label: "x" })({
      ok: true,
      bytesOut: 0,
      bytesIn: 10,
      reached: true,
    })
    network.begin({ dir: "down", via: "http", label: "x" })({
      ok: true,
      bytesOut: 0,
      bytesIn: 0,
      reached: true,
    })
    expect(network.getSnapshot()).toMatchObject({ upBps: null, downBps: null })
  })

  it("smooths speed with a half-life, never jumping all the way", () => {
    expect(smooth(null, null, 500, 0)).toBe(500)
    // 3 s later: halfway
    expect(smooth(100, 0, 300, 3_000)).toBe(200)
    // at once: at least 20% of the step
    expect(smooth(100, 0, 200, 0)).toBe(120)
  })

  it("keeps the last 5 outcomes and 40 transfers", () => {
    const network = createNetworkTelemetry(clock().now)
    for (let i = 0; i < 45; i++)
      network.begin({ dir: "down", via: "http", label: `r${i}` })({
        ok: true,
        bytesOut: 0,
        bytesIn: 1,
        reached: i % 2 === 0,
      })
    const s = network.getSnapshot()
    expect(s.outcomes).toHaveLength(5)
    expect(s.transfers).toHaveLength(40)
    expect(s.transfers[0]?.label).toBe("r44")
  })

  it("coalesces live updates within 10 s", () => {
    const c = clock()
    const network = createNetworkTelemetry(c.now)
    network.live(100)
    c.advance(5_000)
    network.live(50)
    c.advance(11_000)
    network.live(10)
    const rows = network.getSnapshot().transfers
    expect(rows.map((r) => [r.label, r.count, r.bytes])).toEqual([
      ["Live updates", 1, 10],
      ["Live updates", 2, 150],
    ])
    expect(network.getSnapshot().answeredAt).toBe(c.now())
  })

  it("ping smooths half and half", () => {
    const network = createNetworkTelemetry(clock().now)
    network.ping(100)
    network.ping(50)
    expect(network.getSnapshot().pingMs).toBe(75)
  })

  it("keeps 30 minutes of history, and remembers when the device came online", () => {
    const c = clock()
    const network = createNetworkTelemetry(c.now)
    network.sample(true, 4)
    c.advance(HISTORY_MS)
    network.sample(false, 0)
    expect(network.getSnapshot().history).toEqual([
      { at: c.now(), online: false, quality: 0, pingMs: null },
    ])
    network.wentOnline()
    expect(network.getSnapshot().onlineSince).toBe(c.now())
  })
})

const snap = (o: Partial<NetworkSnapshot> = {}): NetworkSnapshot => ({
  ...EMPTY_NETWORK,
  answeredAt: 10,
  onlineSince: 0,
  ...o,
})

describe("notch state (criteria 3–8)", () => {
  it("quality from ping, one bar less after failures (criterion 5)", () => {
    expect([80, 200, 500, 900].map((p) => qualityFrom(true, p, []))).toEqual([
      4, 3, 2, 1,
    ])
    expect(qualityFrom(true, 80, [true, false, true, false])).toBe(3)
    expect(qualityFrom(true, 900, [false, false])).toBe(1)
    expect(qualityFrom(true, null, [])).toBe(3)
    expect(qualityFrom(false, 10, [])).toBe(0)
  })

  it("offline: no bars, links off (criterion 3)", () => {
    const s = deriveNetworkStatus({
      online: false,
      network: snap({ activeUp: 1 }),
      pending: 2,
      attention: 0,
    })
    expect(s).toMatchObject({
      connection: "offline",
      quality: 0,
      up: { mode: "off", waiting: true },
      down: { mode: "off" },
    })
    expect(s.summary).toBe("offline, 2 waiting to upload")
  })

  it("starting, then connecting until something answers after coming online (criterion 4)", () => {
    expect(
      deriveNetworkStatus({
        online: true,
        network: snap({ answeredAt: null }),
        pending: 0,
        attention: 0,
      }).connection
    ).toBe("starting")
    expect(
      deriveNetworkStatus({
        online: true,
        network: snap({ answeredAt: 5, onlineSince: 9 }),
        pending: 0,
        attention: 0,
      })
    ).toMatchObject({
      connection: "connecting",
      quality: 0,
      summary: "connecting",
    })
  })

  it("online: links active while transfers run (criterion 6)", () => {
    const s = deriveNetworkStatus({
      online: true,
      network: snap({ pingMs: 80, activeUp: 1, upBps: 5_000 }),
      pending: 1,
      attention: 0,
    })
    expect(s).toMatchObject({
      connection: "online",
      quality: 4,
      up: { mode: "active", bps: 5_000, waiting: false },
      down: { mode: "idle" },
    })
    expect(s.summary).toBe("connected, strong signal, uploading")
    expect(
      deriveNetworkStatus({
        online: true,
        network: snap({ activeDown: 2 }),
        pending: 0,
        attention: 0,
      }).summary
    ).toBe("connected, good signal, downloading")
  })

  it("attention and waiting changes (criterion 8)", () => {
    const s = deriveNetworkStatus({
      online: true,
      network: snap(),
      pending: 3,
      attention: 1,
    })
    expect(s.attention).toBe(true)
    expect(s.up.waiting).toBe(true)
    expect(s.summary).toBe(
      "connected, good signal, 1 change needs attention, 3 waiting to upload"
    )
    expect(
      deriveNetworkStatus({
        online: true,
        network: snap(),
        pending: 0,
        attention: 2,
      }).summary
    ).toContain("2 changes need attention")
  })

  it("bits loop faster as throughput grows (criterion 7)", () => {
    expect(bitLoopSeconds(10_000_000)).toBeLessThanOrEqual(0.3)
    expect(bitLoopSeconds(10_000)).toBeGreaterThanOrEqual(1.5)
    expect(bitLoopSeconds(null)).toBe(1.6)
    expect(bitLoopSeconds(0)).toBe(1.6)
    expect(bitLoopSeconds(1e9)).toBe(0.25)
    expect(bitLoopSeconds(316_228)).toBeCloseTo(0.93, 1)
  })

  it("formats rates and sizes", () => {
    expect([2_500_000, 340_000, 12].map(formatRate)).toEqual([
      "2.5 MB/s",
      "340 KB/s",
      "12 B/s",
    ])
    expect([2_500_000, 340_000, 12].map(formatBytes)).toEqual([
      "2.5 MB",
      "340 KB",
      "12 B",
    ])
  })
})

describe("monitor and probe (criterion 11)", () => {
  it("probes only when visible, online, idle and quiet for 30 s", () => {
    expect(shouldProbe(true, true, null, 0, 0)).toBe(true)
    expect(shouldProbe(true, true, 0, 0, PROBE_AFTER_MS)).toBe(true)
    expect(shouldProbe(true, true, 0, 0, PROBE_AFTER_MS - 1)).toBe(false)
    expect(shouldProbe(false, true, null, 0, 0)).toBe(false)
    expect(shouldProbe(true, false, null, 0, 0)).toBe(false)
    expect(shouldProbe(true, true, null, 1, 0)).toBe(false)
  })

  it("samples every 10 s, probes once at a time, and follows online events", async () => {
    const c = clock()
    const network = createNetworkTelemetry(c.now)
    let tick: () => void = () => undefined
    const listeners = new Map<string, () => void>()
    let resolveProbe: () => void = () => undefined
    const probe = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolveProbe = r
        })
    )
    const cleared = vi.fn()
    const detach = attachNetworkMonitor({
      telemetry: network,
      isOnline: () => true,
      isVisible: () => true,
      probe,
      now: c.now,
      window: {
        addEventListener: (type: string, l: () => void) =>
          void listeners.set(type, l),
        removeEventListener: (type: string) => void listeners.delete(type),
      } as never,
      setInterval: (fn, ms) => {
        expect(ms).toBe(SAMPLE_MS)
        tick = fn
        return 7
      },
      clearInterval: cleared,
    })
    expect(network.getSnapshot().history).toHaveLength(1)
    expect(probe).toHaveBeenCalledTimes(1)
    tick()
    expect(probe).toHaveBeenCalledTimes(1) // one probe in flight
    resolveProbe()
    await Promise.resolve()
    await Promise.resolve()
    tick()
    expect(probe).toHaveBeenCalledTimes(2)
    c.advance(1)
    listeners.get("online")?.()
    expect(network.getSnapshot().onlineSince).toBe(c.now())
    detach()
    expect(cleared).toHaveBeenCalledWith(7)
    expect(listeners.size).toBe(0)
  })

  it("a failed probe is swallowed", async () => {
    const network = createNetworkTelemetry(clock().now)
    const probe = vi.fn(() => Promise.reject(new Error("down")))
    const detach = attachNetworkMonitor({
      telemetry: network,
      isOnline: () => true,
      isVisible: () => true,
      probe,
      now: () => 0,
      window: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      } as never,
    })
    await Promise.resolve()
    detach()
    expect(probe).toHaveBeenCalled()
  })
})

describe("request names and sizes", () => {
  it("names requests", () => {
    expect(describeRequest("GET", "/sync/changes")).toBe("Changes")
    expect(describeRequest("GET", "/meta")).toBe("Status check")
    expect(describeRequest("POST", "/scout-entries")).toBe("Save scout entries")
    expect(describeRequest("DELETE", "/comments/1")).toBe("Delete comments")
    expect(describeRequest("PATCH", "/picklists/1")).toBe("Update picklists")
    expect(describeRequest("GET", "/teams")).toBe("Teams")
    expect(describeRequest("POST", "/auth/login")).toBe("Sign-in")
    expect(describeRequest("GET", "/")).toBe("Request")
  })

  it("approximates body sizes", () => {
    expect(approxBytes(undefined)).toBe(0)
    expect(approxBytes(null)).toBe(0)
    expect(approxBytes("abc")).toBe(3)
    expect(approxBytes({ a: 1 })).toBe(7)
    const form = new FormData()
    form.append("name", "abcd")
    form.append("file", new Blob(["12345"]))
    expect(approxBytes(form)).toBe(9)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(approxBytes(cyclic)).toBe(0)
  })
})
