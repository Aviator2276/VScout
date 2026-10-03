// useLiveQuery returns undefined both while loading AND when the querier resolves to undefined, and
// rethrows querier errors during render (data-layer §9.2, verified). This wrapper settles every
// result into a value, so `undefined` means "loading" and nothing else. Internal to lib/db/react.
//
// Remounts (a tab switch, Back) would start at "loading" again although Dexie has the data, which
// flashed a skeleton on every page switch. A query that passes a `cacheKey` starts from its last
// successful result instead, and the live query refreshes it right after (stale-while-revalidate).
import { useLiveQuery } from "dexie-react-hooks"
import type { DependencyList } from "react"

export type Settled<TValue> =
  | { kind: "idle" }
  | { kind: "ok"; value: TValue }
  | { kind: "error"; error: unknown }

const IDLE = { kind: "idle" } as const

const CACHE_LIMIT = 300
const cache = new Map<string, Settled<unknown>>()

function remember(key: string, value: Settled<unknown>): void {
  cache.delete(key)
  cache.set(key, value)
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
}

/** Forget every remembered result (sign-out wipes the database). */
export function clearLiveCache(): void {
  cache.clear()
}

const objectIds = new WeakMap<object, number>()
let nextObjectId = 0

function identity(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (typeof value === "object" || typeof value === "function") {
    let id = objectIds.get(value)
    if (id === undefined) {
      id = ++nextObjectId
      objectIds.set(value, id)
    }
    return `#${id}`
  }
  return `${typeof value}:${String(value)}`
}

/**
 * A key for one query: its code, its inputs, and the database. Objects count by identity (the
 * same instance → the same key), so a key never matches data read with different inputs.
 */
export function liveCacheKey(
  query: (...args: never[]) => unknown,
  parts: DependencyList
): string {
  return `${query.toString()}\u0000${parts.map(identity).join("\u0000")}`
}

export function useLive<TValue>(
  querier: (() => Promise<TValue>) | null,
  deps: DependencyList,
  cacheKey?: string
): Settled<TValue> | undefined {
  const key = querier && cacheKey !== undefined ? cacheKey : null
  return useLiveQuery(
    async (): Promise<Settled<TValue>> => {
      if (!querier) return IDLE
      try {
        const settled = { kind: "ok", value: await querier() } as const
        if (key !== null) remember(key, settled)
        return settled
      } catch (error) {
        return { kind: "error", error }
      }
    },
    // callers pass the querier's inputs as deps (like useEffect)
    [querier === null, ...deps],
    key === null ? undefined : (cache.get(key) as Settled<TValue> | undefined)
  )
}
