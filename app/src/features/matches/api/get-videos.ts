// Downloaded match videos (features/matches.md M3): read from `mediaVideos`, so progress updates live.
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { useCollectionState, useLiveOr } from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import type { MediaVideoRow } from "@/lib/db/types"

export function useEventVideos(
  eventKey: string
): DataState<ReadonlyArray<MediaVideoRow>> {
  const { db } = useDataRuntime()
  return useCollectionState({
    enabled: true,
    // local only: never waits on a sync scope
    source: [],
    deps: [eventKey],
    share: (v) => `${v.id}:${v.downloadState}:${v.bytesDownloaded}`,
    query: async () =>
      (await db.mediaVideos.where("eventKey").equals(eventKey).toArray()).sort(
        (a, b) =>
          a.matchKey.localeCompare(b.matchKey, undefined, { numeric: true })
      ),
  })
}

export function useMatchVideoRows(
  matchKey: string
): ReadonlyArray<MediaVideoRow> {
  const { db } = useDataRuntime()
  return useLiveOr(
    () => db.mediaVideos.filter((v) => v.matchKey === matchKey).toArray(),
    [matchKey],
    []
  )
}
