export function compare(a: string, b: string): number
export function inc(version: string, type: string, preid?: string): string
export function autoPlan(
  baseVersion: string,
  commitText: string,
  channel: string | null
): { type: string; preid?: string }
export function readChannel(path: string): string | null
