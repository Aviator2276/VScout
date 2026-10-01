// Injectable time (testing.md: never Date.now() directly in domain code).
export interface Clock {
  now: () => number
}

export const systemClock: Clock = { now: () => Date.now() }
