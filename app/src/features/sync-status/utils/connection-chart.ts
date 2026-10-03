// The Sync sheet's connection chart, as data (features/sync-status.md S3, criterion 10): a step line of
// connection bars over time, offline stretches as bands, and a one-line summary.
import type {
  HistorySample,
  TransferRecord,
} from "@/lib/network/network-telemetry"

export interface Band {
  from: number
  to: number
}

export interface ChartModel {
  /** time axis */
  start: number
  end: number
  /** step path in a 0..1 × 0..1 box (x = time, y = 1 - quality/4) */
  line: string
  area: string
  bands: Array<Band>
  /** "Online 25 of 30 min · 1 drop" */
  summary: string
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

export function chartModel(
  samples: ReadonlyArray<HistorySample>,
  windowMs: number,
  sampleMs: number,
  now: number
): ChartModel {
  const start = now - windowMs
  const shown = samples.filter((s) => s.at >= start)
  const x = (t: number) => Math.min(1, Math.max(0, (t - start) / windowMs))
  const y = (q: number) => 1 - q / 4
  let line = ""
  let area = ""
  const bands: Array<Band> = []
  let onlineMs = 0
  let drops = 0
  shown.forEach((s, i) => {
    const next = shown[i + 1]?.at ?? Math.min(now, s.at + sampleMs)
    const x0 = x(s.at)
    const x1 = x(next)
    const yy = y(s.online ? s.quality : 0)
    line += `${i === 0 ? "M" : "L"}${x0.toFixed(4)} ${yy.toFixed(4)}H${x1.toFixed(4)}`
    if (s.online) onlineMs += next - s.at
    else {
      const last = bands.at(-1)
      if (last && last.to === s.at) last.to = next
      else bands.push({ from: s.at, to: next })
    }
    const prev = shown[i - 1]
    if (prev?.online && !s.online) drops++
  })
  const first = shown[0]
  const lastSample = shown.at(-1)
  if (first && lastSample) {
    const xEnd = x(Math.min(now, lastSample.at + sampleMs))
    area = `${line}L${xEnd.toFixed(4)} 1L${x(first.at).toFixed(4)} 1Z`
  }
  const totalMin = Math.round(
    shown.length
      ? (Math.min(now, (lastSample?.at ?? now) + sampleMs) -
          (first?.at ?? now)) /
          60_000
      : 0
  )
  const onlineMin = Math.round(onlineMs / 60_000)
  // under a minute of history reads as "collecting", not "0 of 0 min"
  const summary =
    shown.length === 0 || totalMin < 1
      ? "Collecting history…"
      : `Online ${onlineMin} of ${plural(totalMin, "min", "min")}${drops ? ` · ${plural(drops, "drop", "drops")}` : ""}`
  return { start, end: now, line, area, bands, summary }
}

/** The sample under a pointer at fraction `f` of the chart's width. */
export function sampleAt(
  samples: ReadonlyArray<HistorySample>,
  start: number,
  windowMs: number,
  f: number
): HistorySample | null {
  const t = start + f * windowMs
  let best: HistorySample | null = null
  for (const s of samples) if (s.at <= t) best = s
  return best ?? samples[0] ?? null
}

/** Back-to-back transfers of the same kind (one sync's pages) read as one row: "Changes · 6". */
export function groupTransfers(
  list: ReadonlyArray<TransferRecord>,
  withinMs = 3_000
): Array<TransferRecord> {
  const out: Array<TransferRecord> = []
  for (const t of list) {
    const last = out.at(-1)
    if (
      last &&
      last.label === t.label &&
      last.dir === t.dir &&
      last.via === t.via &&
      last.outcome === t.outcome &&
      t.outcome !== "active" &&
      last.at - t.at <= withinMs
    )
      out[out.length - 1] = {
        ...last,
        bytes: last.bytes + t.bytes,
        count: (last.count ?? 1) + (t.count ?? 1),
        ms: (last.ms ?? 0) + (t.ms ?? 0),
      }
    else out.push(t)
  }
  return out
}
