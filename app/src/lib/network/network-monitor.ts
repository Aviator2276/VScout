// Feeds the telemetry's history and keeps ping fresh (features/sync-status.md S2): a sample every
// 10 s, and a tiny probe only while the app is visible, online and nothing answered for 30 s.
import type { NetworkTelemetry } from "./network-telemetry"
import { SAMPLE_MS } from "./network-telemetry"
import { qualityFrom } from "./network-status"

export const PROBE_AFTER_MS = 30_000

export interface NetworkMonitorDeps {
  telemetry: NetworkTelemetry
  isOnline: () => boolean
  isVisible: () => boolean
  /** GET /meta through the API client (measured, quiet) */
  probe: () => Promise<unknown>
  now: () => number
  window: Pick<Window, "addEventListener" | "removeEventListener">
  setInterval?: (fn: () => void, ms: number) => unknown
  clearInterval?: (id: unknown) => void
}

/** Whether a probe should run now (S2, criterion 11). */
export function shouldProbe(
  online: boolean,
  visible: boolean,
  answeredAt: number | null,
  active: number,
  now: number
): boolean {
  if (!online || !visible || active > 0) return false
  return answeredAt === null || now - answeredAt >= PROBE_AFTER_MS
}

export function attachNetworkMonitor(d: NetworkMonitorDeps): () => void {
  const every = d.setInterval ?? ((fn, ms) => setInterval(fn, ms))
  const stop =
    d.clearInterval ??
    ((id) => clearInterval(id as ReturnType<typeof setInterval>))
  let probing = false
  const tick = () => {
    const online = d.isOnline()
    const s = d.telemetry.getSnapshot()
    d.telemetry.sample(online, qualityFrom(online, s.pingMs, s.outcomes))
    if (
      !probing &&
      shouldProbe(
        online,
        d.isVisible(),
        s.answeredAt,
        s.activeUp + s.activeDown,
        d.now()
      )
    ) {
      probing = true
      void d
        .probe()
        .catch(() => undefined)
        .finally(() => {
          probing = false
        })
    }
  }
  const onOnline = () => d.telemetry.wentOnline()
  d.window.addEventListener("online", onOnline)
  tick()
  const id = every(tick, SAMPLE_MS)
  return () => {
    stop(id)
    d.window.removeEventListener("online", onOnline)
  }
}
