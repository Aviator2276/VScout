// Priority lanes for incoming data (mqtt.md §8.2). Urgent items are applied at once, one per
// transaction; normal items batch for 50 ms; bulk for 250 ms or 100 items. One ingest runs at a
// time, always urgent first, then normal, then bulk, with a starvation guard for bulk.
import { logger } from "@/lib/logger"

export type Lane = "urgent" | "normal" | "bulk"

export interface LaneOptions {
  normalMs?: number
  bulkMs?: number
  bulkMax?: number
  /** bulk runs at least this often even while urgent/normal keep flowing */
  bulkStarvationMs?: number
  now?: () => number
}

export interface LaneBatcher {
  push: (lane: Lane, raw: unknown) => void
  /** resolves when every queued item has been ingested (tests, stop) */
  drain: () => Promise<void>
  dispose: () => void
}

export function createLaneBatcher(
  ingestMany: (raws: Array<unknown>, lane: Lane) => Promise<void>,
  opts: LaneOptions = {}
): LaneBatcher {
  const normalMs = opts.normalMs ?? 50
  const bulkMs = opts.bulkMs ?? 250
  const bulkMax = opts.bulkMax ?? 100
  const starvationMs = opts.bulkStarvationMs ?? 1000
  const now = opts.now ?? (() => Date.now())

  const queues: Record<Lane, Array<unknown>> = {
    urgent: [],
    normal: [],
    bulk: [],
  }
  const ready: Record<"normal" | "bulk", boolean> = {
    normal: false,
    bulk: false,
  }
  const timers: Partial<
    Record<"normal" | "bulk", ReturnType<typeof setTimeout>>
  > = {}
  let bulkSince: number | null = null
  let running: Promise<void> | null = null

  const arm = (lane: "normal" | "bulk", ms: number) => {
    if (timers[lane]) return
    timers[lane] = setTimeout(() => {
      timers[lane] = undefined
      ready[lane] = true
      kick()
    }, ms)
  }

  const next = (): { lane: Lane; items: Array<unknown> } | null => {
    const starving =
      bulkSince !== null &&
      now() - bulkSince >= starvationMs &&
      queues.bulk.length > 0
    if (queues.urgent.length && !starving)
      return { lane: "urgent", items: queues.urgent.splice(0, 1) }
    if (ready.normal && queues.normal.length && !starving) {
      ready.normal = false
      return { lane: "normal", items: queues.normal.splice(0) }
    }
    if (
      (ready.bulk || starving || queues.bulk.length >= bulkMax) &&
      queues.bulk.length
    ) {
      ready.bulk = false
      const items = queues.bulk.splice(0, bulkMax)
      bulkSince = queues.bulk.length ? now() : null
      if (queues.bulk.length) arm("bulk", bulkMs)
      return { lane: "bulk", items }
    }
    return null
  }

  const kick = () => {
    if (running) return
    running = (async () => {
      // yield once so `running` is assigned before the loop can finish and clear it
      await Promise.resolve()
      for (let job = next(); job; job = next()) {
        try {
          await ingestMany(job.items, job.lane)
        } catch (error) {
          logger.error("mqtt", "ingest failed", {
            lane: job.lane,
            error: String(error),
          })
        }
      }
      running = null
    })()
  }

  return {
    push(lane, raw) {
      queues[lane].push(raw)
      if (lane === "normal") arm("normal", normalMs)
      if (lane === "bulk") {
        bulkSince ??= now()
        arm("bulk", bulkMs)
      }
      kick()
    },
    async drain() {
      ready.normal = true
      ready.bulk = true
      for (const t of Object.values(timers)) clearTimeout(t)
      timers.normal = undefined
      timers.bulk = undefined
      kick()
      while (running) await running
    },
    dispose() {
      for (const t of Object.values(timers)) clearTimeout(t)
      queues.urgent = []
      queues.normal = []
      queues.bulk = []
    },
  }
}
