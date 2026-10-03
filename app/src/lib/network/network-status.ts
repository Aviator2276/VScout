// What the Sync Status notch shows (features/sync-status.md S1), derived from the telemetry, the
// browser's online flag, MQTT and the sync engine. Pure, so every state is table-tested.
import type { NetworkSnapshot } from "./network-telemetry"

export type ConnectionKind = "starting" | "connecting" | "online" | "offline"
export type LinkMode = "off" | "idle" | "active"

export interface LinkState {
  mode: LinkMode
  /** smoothed bytes per second, null when unknown */
  bps: number | null
  /** the uplink has changes waiting that it can't send yet */
  waiting: boolean
}

export interface NetworkStatus {
  connection: ConnectionKind
  /** 0–4 bars */
  quality: number
  /** open conflicts, rejected saves or sign-in needed */
  attention: boolean
  down: LinkState
  up: LinkState
  /** "connected, good signal, uploading" (the notch's accessible name) */
  summary: string
}

export interface NetworkStatusInput {
  online: boolean
  network: NetworkSnapshot
  /** outbox ops not sent yet */
  pending: number
  /** open conflicts + rejected saves + sign-in needed */
  attention: number
}

/** Bars from ping and recent transport failures (S1 "Connection quality"). */
export function qualityFrom(
  online: boolean,
  pingMs: number | null,
  outcomes: ReadonlyArray<boolean>
): number {
  if (!online) return 0
  const base =
    pingMs === null
      ? 3
      : pingMs < 100
        ? 4
        : pingMs < 250
          ? 3
          : pingMs < 600
            ? 2
            : 1
  const failures = outcomes.filter((ok) => !ok).length
  return Math.max(1, failures >= 2 ? base - 1 : base)
}

const QUALITY_WORD = [
  "no signal",
  "weak signal",
  "fair signal",
  "good signal",
  "strong signal",
]

export function deriveNetworkStatus(i: NetworkStatusInput): NetworkStatus {
  // HTTP or MQTT answering is what counts: MQTT reconnecting behind a working HTTP path is "online"
  const answered =
    i.network.answeredAt !== null &&
    i.network.answeredAt >= i.network.onlineSince
  const connection: ConnectionKind = !i.online
    ? "offline"
    : i.network.answeredAt === null
      ? "starting"
      : answered
        ? "online"
        : "connecting"
  const quality =
    connection === "online"
      ? qualityFrom(true, i.network.pingMs, i.network.outcomes)
      : 0
  const live = connection !== "offline"
  const link = (
    active: number,
    bps: number | null,
    waiting: boolean
  ): LinkState => ({
    mode: !live
      ? "off"
      : active > 0
        ? "active"
        : connection === "online"
          ? "idle"
          : "off",
    bps,
    waiting,
  })
  const down = link(i.network.activeDown, i.network.downBps, false)
  const up = link(
    i.network.activeUp,
    i.network.upBps,
    i.pending > 0 && (!live || i.network.activeUp === 0)
  )
  const words = [
    connection === "offline"
      ? "offline"
      : connection === "online"
        ? `connected, ${QUALITY_WORD[quality] ?? ""}`
        : "connecting",
    i.attention > 0
      ? `${i.attention} ${i.attention === 1 ? "change needs" : "changes need"} attention`
      : null,
    down.mode === "active" ? "downloading" : null,
    up.mode === "active" ? "uploading" : null,
    up.waiting ? `${i.pending} waiting to upload` : null,
  ].filter(Boolean)
  return {
    connection,
    quality,
    attention: i.attention > 0,
    down,
    up,
    summary: words.join(", "),
  }
}

/** Seconds per loop of streaming bits: 1.6 s at ≤ 10 KB/s down to 0.25 s at ≥ 10 MB/s (log scale). */
export function bitLoopSeconds(bps: number | null): number {
  const slow = 1.6
  const fast = 0.25
  if (bps === null || bps <= 0) return slow
  const t = Math.min(1, Math.max(0, (Math.log10(bps) - 4) / 3))
  return Math.round((slow + (fast - slow) * t) * 100) / 100
}

/** "1.2 MB/s", "340 KB/s", "12 B/s" */
export function formatRate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`
  if (bps >= 1_000) return `${Math.round(bps / 1_000)} KB/s`
  return `${Math.round(bps)} B/s`
}

/** "1.2 MB", "340 KB", "12 B" */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`
  return `${bytes} B`
}
