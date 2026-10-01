// Deterministic UUIDv7-shaped ids and timestamps for tests. Reset between tests with resetIds().
let counter = 0

export function testId(n?: number): string {
  const value = n ?? ++counter
  return `01900000-0000-7000-8000-${String(value).padStart(12, "0")}`
}

export function resetIds(): void {
  counter = 0
}

/** A fixed base time so expectations are stable: 2026-03-20T15:00:00.000Z plus `minutes`. */
export function testTime(minutes = 0): string {
  return new Date(Date.UTC(2026, 2, 20, 15, minutes)).toISOString()
}
