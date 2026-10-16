// Injectable time source so tests can move the clock (match scheduler, refresh grace, retention).
export interface Clock {
  now(): number
}

export const systemClock: Clock = { now: () => Date.now() }

export class ManualClock implements Clock {
  constructor(private t: number = Date.parse("2026-03-20T16:00:00.000Z")) {}
  now() {
    return this.t
  }
  set(ms: number) {
    this.t = ms
  }
  advance(ms: number) {
    this.t += ms
  }
}

export const iso = (ms: number) => new Date(ms).toISOString()
