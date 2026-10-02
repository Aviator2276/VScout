// What the data-state hooks need from the running app: the db, the sync status mirror and whether
// the engine can sync right now. Provided once by the app shell (src/app), mocked in tests.
import { createContext, use } from "react"
import type { VScoutDB } from "@/lib/db/schema"
import type { ScopeInfoStore } from "@/lib/sync/scope-info"

export interface DataRuntime {
  db: VScoutDB
  scopeInfo: ScopeInfoStore
  /** online, signed in and not paused: a never-synced list is "loading", not "not synced" */
  canSync: () => boolean
  /** re-render when canSync may have changed */
  subscribeSync: (listener: () => void) => () => void
  /** ask the engine to fetch a record that isn't here yet (throttled by the caller) */
  requestSync?: () => void
  clockSkewMs?: () => number
}

export const DataRuntimeContext = createContext<DataRuntime | null>(null)

export function useDataRuntime(): DataRuntime {
  const runtime = use(DataRuntimeContext)
  if (!runtime) throw new Error("useDataRuntime outside DataRuntimeContext")
  return runtime
}
