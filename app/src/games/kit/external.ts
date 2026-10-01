// Reading TBA / Statbotics values through a module's scoringKeys. Unknown enum strings map to
// 'unknown' (never silently to a real option) and are reported (v1 lesson, game-module addendum).
import type { ScoringKeys } from "../types"

export function readPath(source: unknown, path: string): unknown {
  let current: unknown = source
  for (const part of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export type EnumMapResult = { value: string | null; known: boolean }

export function mapEnum(
  keys: ScoringKeys,
  mapName: string,
  raw: unknown
): EnumMapResult {
  const map = keys.enumMaps[mapName]
  if (typeof raw !== "string" || !map) return { value: "unknown", known: false }
  if (raw in map) return { value: map[raw] ?? null, known: true }
  return { value: "unknown", known: false }
}

/** A per-robot TBA value for station n (1–3), mapped through its enumMap when it has one. */
export function perRobotValue(
  keys: ScoringKeys,
  key: string,
  allianceBreakdown: unknown,
  station: 1 | 2 | 3
): EnumMapResult | undefined {
  const def = keys.tba.perRobot[key]
  if (!def) return undefined
  const raw = readPath(
    allianceBreakdown,
    def.path.replace("{n}", String(station))
  )
  if (def.enumMap) return mapEnum(keys, def.enumMap, raw)
  return {
    value: raw === undefined || raw === null ? null : String(raw),
    known: true,
  }
}
