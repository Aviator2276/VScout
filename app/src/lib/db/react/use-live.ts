// useLiveQuery returns undefined both while loading AND when the querier resolves to undefined, and
// rethrows querier errors during render (data-layer §9.2, verified). This wrapper settles every
// result into a value, so `undefined` means "loading" and nothing else. Internal to lib/db/react.
import { useLiveQuery } from "dexie-react-hooks"
import type { DependencyList } from "react"

export type Settled<TValue> =
  | { kind: "idle" }
  | { kind: "ok"; value: TValue }
  | { kind: "error"; error: unknown }

const IDLE = { kind: "idle" } as const

export function useLive<TValue>(
  querier: (() => Promise<TValue>) | null,
  deps: DependencyList
): Settled<TValue> | undefined {
  return useLiveQuery(
    async (): Promise<Settled<TValue>> => {
      if (!querier) return IDLE
      try {
        return { kind: "ok", value: await querier() }
      } catch (error) {
        return { kind: "error", error }
      }
    },
    // callers pass the querier's inputs as deps (like useEffect)
    [querier === null, ...deps]
  )
}
