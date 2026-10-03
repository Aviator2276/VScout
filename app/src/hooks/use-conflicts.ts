// Open sync conflicts (data-layer §11) and how to resolve them. The Settings → Sync Conflicts list
// and "Needs attention" in My Entries both read this.
import { useCallback } from "react"
import { activeGame } from "@/config/game"
import { useDataRuntime, useWriter } from "@/lib/db/react/data-runtime"
import { useCollectionState } from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import { buildConflictView } from "@/lib/sync/conflict-view"
import type { ConflictView } from "@/lib/sync/conflict-view"
import { resolveConflict } from "@/lib/sync/conflicts"
import type { Resolution } from "@/lib/sync/conflicts"
import { longMatchLabel, parseMatchKey } from "@/utils/match-label"

const matchLabel = (key: string) => {
  const id = parseMatchKey(key)
  return id ? longMatchLabel(id) : key
}

export function useOpenConflicts(): DataState<ReadonlyArray<ConflictView>> {
  const { db } = useDataRuntime()
  return useCollectionState({
    enabled: true,
    // conflicts are local: always "downloaded"
    source: [],
    deps: [],
    share: (v) =>
      `${v.conflict.id}:${v.conflict.detectedAt}:${v.conflict.status}`,
    query: async () =>
      (await db.conflicts.where("status").equals("open").toArray())
        .sort((a, b) => b.detectedAt - a.detectedAt)
        .map((c) => buildConflictView(c, activeGame, { matchLabel })),
  })
}

export function useResolveConflict(): (
  conflictId: string,
  choice: Resolution
) => Promise<void> {
  const writer = useWriter()
  return useCallback(
    (conflictId, choice) =>
      resolveConflict(
        {
          db: writer.db,
          now: writer.clock.now,
          newId: writer.ids.newId,
          session: writer.session,
          ...(writer.onWrite ? { onWrite: writer.onWrite } : {}),
        },
        conflictId,
        choice
      ),
    [writer]
  )
}
