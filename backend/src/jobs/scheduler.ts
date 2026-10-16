// Background jobs (REQUIREMENTS §11, §10.3, §13.3): import cadences per tracked event, the
// "match coming up" tick, and daily pruning. One loop, jobs never overlap themselves.
import type { Importer, ImportJob } from "../imports/importer.js"
import type { Clock } from "../lib/clock.js"

/** How often each import runs for a live event (ms); non-live tracked events refresh daily. */
export const CADENCE: Record<ImportJob, number> = {
  nexus: 30_000,
  matches: 60_000,
  rankings: 3 * 60_000,
  pits: 10 * 60_000,
  statbotics: 10 * 60_000,
  pitMap: 60 * 60_000,
  event: 24 * 60 * 60_000,
}
const IDLE_CADENCE = 24 * 60 * 60_000

export interface Task {
  name: string
  everyMs: number
  run: () => Promise<unknown>
}

export class Scheduler {
  private last = new Map<string, number>()
  private running = new Set<string>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    private clock: Clock,
    private importer: Importer | null,
    private tasks: Task[],
    private log: (msg: string, err?: unknown) => void = () => {}
  ) {}

  start(tickMs = 5_000) {
    this.timer = setInterval(() => void this.tick(), tickMs)
    this.timer.unref()
    void this.tick()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private due(key: string, every: number): boolean {
    if (this.running.has(key)) return false
    const last = this.last.get(key)
    return last === undefined || this.clock.now() - last >= every
  }

  private launch(key: string, fn: () => Promise<unknown>) {
    this.running.add(key)
    this.last.set(key, this.clock.now())
    fn()
      .catch((e: unknown) => this.log(`job ${key} failed`, e))
      .finally(() => this.running.delete(key))
  }

  async tick() {
    for (const t of this.tasks) if (this.due(t.name, t.everyMs)) this.launch(t.name, t.run)
    const imp = this.importer
    if (!imp) return
    for (const ev of imp.trackedEvents()) {
      // one chain per event so jobs for an event run in order and never pile up
      const chainKey = `import:${ev.eventKey}`
      if (this.running.has(chainKey)) continue
      const jobs = (Object.keys(CADENCE) as ImportJob[]).filter(
        (j) => imp.available(j) && this.due(`${ev.eventKey}:${j}`, ev.live ? CADENCE[j] : IDLE_CADENCE)
      )
      if (!jobs.length) continue
      // event info first on a fresh event, so matches and teams have something to attach to
      jobs.sort((a, b) => (a === "event" ? -1 : b === "event" ? 1 : 0))
      for (const j of jobs) this.last.set(`${ev.eventKey}:${j}`, this.clock.now())
      this.launch(chainKey, async () => {
        for (const j of jobs) await imp.run(j, ev.eventKey)
      })
    }
  }
}
