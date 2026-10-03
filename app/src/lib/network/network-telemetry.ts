// What the app is sending and receiving, how fast, and how responsive the server is (ADR-079,
// features/sync-status.md S2). App-wide and memory-only. The API client and the MQTT connection report
// into it; the Sync Status notch and sheet read it. Speeds are this app's own throughput, not the
// link's capacity, which browsers can't read.
import { createStore } from "@/lib/mqtt/external-store"
import type { ExternalStore } from "@/lib/mqtt/external-store"

export type LinkDir = "up" | "down"
export type TransferVia = "http" | "mqtt" | "live"

export interface TransferRecord {
  id: number
  label: string
  dir: LinkDir
  via: TransferVia
  bytes: number
  /** null while in flight */
  ms: number | null
  outcome: "active" | "ok" | "failed"
  at: number
  /** coalesced live updates: how many messages this row stands for */
  count?: number
}

export interface HistorySample {
  at: number
  online: boolean
  /** 0–4, the connection bars */
  quality: number
  pingMs: number | null
}

export interface NetworkSnapshot {
  activeUp: number
  activeDown: number
  /** smoothed bytes per second; null before the first transfer */
  upBps: number | null
  downBps: number | null
  lastUpAt: number | null
  lastDownAt: number | null
  pingMs: number | null
  pingAt: number | null
  /** the last 5 transport outcomes (true = reached the server) */
  outcomes: ReadonlyArray<boolean>
  /** last time the server answered at all */
  answeredAt: number | null
  /** when the device last came online (or the app started) */
  onlineSince: number
  history: ReadonlyArray<HistorySample>
  transfers: ReadonlyArray<TransferRecord>
}

export interface TransferStart {
  dir: LinkDir
  via: Exclude<TransferVia, "live">
  label: string
  /** not listed under Recent (the ping probe) */
  quiet?: boolean
}

export interface TransferEnd {
  ok: boolean
  bytesOut: number
  bytesIn: number
  /** reached the server (a 4xx/5xx still counts); false for a transport failure */
  reached: boolean
}

export interface NetworkTelemetry extends ExternalStore<NetworkSnapshot> {
  /** a request starts; call the returned function once when it ends */
  begin: (t: TransferStart) => (end: TransferEnd) => void
  /** an MQTT push (live changes) arrived */
  live: (bytes: number) => void
  /** one latency sample from a small request */
  ping: (ms: number) => void
  /** one history sample (every 10 s) */
  sample: (online: boolean, quality: number) => void
  /** the browser reported `online` */
  wentOnline: () => void
}

export const HISTORY_MS = 30 * 60_000
export const SAMPLE_MS = 10_000
const MAX_TRANSFERS = 40
const HALF_LIFE_MS = 3_000
const LIVE_COALESCE_MS = 10_000
const OUTCOMES = 5

export const EMPTY_NETWORK: NetworkSnapshot = {
  activeUp: 0,
  activeDown: 0,
  upBps: null,
  downBps: null,
  lastUpAt: null,
  lastDownAt: null,
  pingMs: null,
  pingAt: null,
  outcomes: [],
  answeredAt: null,
  onlineSince: 0,
  history: [],
  transfers: [],
}

/** Exponential smoothing with a half-life, so a burst after a quiet minute isn't averaged away. */
export function smooth(
  previous: number | null,
  previousAt: number | null,
  sample: number,
  now: number
): number {
  if (previous === null || previousAt === null) return sample
  const alpha = 1 - 2 ** (-(now - previousAt) / HALF_LIFE_MS)
  return previous + (sample - previous) * Math.min(1, Math.max(alpha, 0.2))
}

export function createNetworkTelemetry(
  now: () => number = () => Date.now()
): NetworkTelemetry {
  const store = createStore<NetworkSnapshot>({
    ...EMPTY_NETWORK,
    onlineSince: now(),
  })
  let nextId = 1

  const pushTransfer = (
    list: ReadonlyArray<TransferRecord>,
    t: TransferRecord
  ) => [t, ...list].slice(0, MAX_TRANSFERS)

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,

    begin(start) {
      const id = nextId++
      const at = now()
      const active = start.dir === "up" ? "activeUp" : "activeDown"
      store.update((s) => ({
        ...s,
        [active]: s[active] + 1,
        transfers: start.quiet
          ? s.transfers
          : pushTransfer(s.transfers, {
              id,
              label: start.label,
              dir: start.dir,
              via: start.via,
              bytes: 0,
              ms: null,
              outcome: "active",
              at,
            }),
      }))
      let ended = false
      return (end) => {
        if (ended) return
        ended = true
        const t = now()
        const ms = Math.max(1, t - at)
        store.update((s) => {
          const next: NetworkSnapshot = {
            ...s,
            [active]: Math.max(0, s[active] - 1),
            outcomes: [...s.outcomes, end.reached].slice(-OUTCOMES),
            answeredAt: end.reached ? t : s.answeredAt,
            transfers: s.transfers.map((r) =>
              r.id === id
                ? {
                    ...r,
                    bytes: end.bytesOut + end.bytesIn,
                    ms,
                    outcome: end.ok ? "ok" : "failed",
                  }
                : r
            ),
          }
          if (!end.reached) return next
          // the body that defines the direction moved at this rate
          if (start.dir === "up" && end.bytesOut > 0)
            return {
              ...next,
              upBps: smooth(s.upBps, s.lastUpAt, (end.bytesOut * 1000) / ms, t),
              lastUpAt: t,
            }
          if (start.dir === "down" && end.bytesIn > 0)
            return {
              ...next,
              downBps: smooth(
                s.downBps,
                s.lastDownAt,
                (end.bytesIn * 1000) / ms,
                t
              ),
              lastDownAt: t,
            }
          return next
        })
      }
    },

    live(bytes) {
      const t = now()
      store.update((s) => {
        const [first, ...rest] = s.transfers
        const transfers =
          first && first.via === "live" && t - first.at < LIVE_COALESCE_MS
            ? [
                {
                  ...first,
                  bytes: first.bytes + bytes,
                  count: (first.count ?? 1) + 1,
                },
                ...rest,
              ]
            : pushTransfer(s.transfers, {
                id: nextId++,
                label: "Live updates",
                dir: "down",
                via: "live",
                bytes,
                ms: 0,
                outcome: "ok",
                at: t,
                count: 1,
              })
        return { ...s, transfers, answeredAt: t, lastDownAt: t }
      })
    },

    ping(ms) {
      const t = now()
      store.update((s) => ({
        ...s,
        pingMs: s.pingMs === null ? ms : Math.round(s.pingMs * 0.5 + ms * 0.5),
        pingAt: t,
      }))
    },

    wentOnline() {
      const t = now()
      store.update((s) => ({ ...s, onlineSince: t }))
    },

    sample(online, quality) {
      const t = now()
      store.update((s) => ({
        ...s,
        history: [
          ...s.history.filter((h) => t - h.at < HISTORY_MS),
          { at: t, online, quality, pingMs: s.pingMs },
        ],
      }))
    },
  }
}
