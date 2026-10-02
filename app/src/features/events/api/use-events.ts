// Every event this device knows (the global scope, ADR-037), newest first.
import { useCollectionState } from "@/lib/db/react/data-state-hooks"
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import type { DataState } from "@/lib/db/react/data-state"
import type { EventRecord } from "@/lib/db/types"

export function useEvents(): DataState<ReadonlyArray<EventRecord>> {
  const { db } = useDataRuntime()
  return useCollectionState({
    enabled: true,
    source: { scope: "global", entity: "event" },
    query: async () =>
      (await db.events.toArray()).sort((a, b) =>
        b.startDate.localeCompare(a.startDate)
      ),
    deps: [],
  })
}
