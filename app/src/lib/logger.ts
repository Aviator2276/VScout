// Ring-buffer logger (coding-standards: log through lib/logger). Keeps the last 500 entries in
// memory; the app attaches a sink that persists them to Dexie for Settings → Diagnostics export.
export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogEntry {
  at: number
  level: LogLevel
  scope: string
  message: string
  data?: unknown
}

const CAPACITY = 500
const buffer: Array<LogEntry> = []
let sink: ((entry: LogEntry) => void) | null = null
let now = () => Date.now()

export function setLogSink(next: ((entry: LogEntry) => void) | null): void {
  sink = next
}

/** Tests inject a clock so entries are deterministic. */
export function setLogClock(clock: () => number): void {
  now = clock
}

export function log(
  level: LogLevel,
  scope: string,
  message: string,
  data?: unknown
): void {
  const entry: LogEntry = {
    at: now(),
    level,
    scope,
    message,
    ...(data === undefined ? {} : { data }),
  }
  buffer.push(entry)
  if (buffer.length > CAPACITY) buffer.shift()
  try {
    sink?.(entry)
  } catch {
    // a failing sink must never break the caller
  }
}

export const logger = {
  debug: (scope: string, message: string, data?: unknown) =>
    log("debug", scope, message, data),
  info: (scope: string, message: string, data?: unknown) =>
    log("info", scope, message, data),
  warn: (scope: string, message: string, data?: unknown) =>
    log("warn", scope, message, data),
  error: (scope: string, message: string, data?: unknown) =>
    log("error", scope, message, data),
}

export function recentLogs(): ReadonlyArray<LogEntry> {
  return [...buffer]
}

export function clearLogs(): void {
  buffer.length = 0
}
