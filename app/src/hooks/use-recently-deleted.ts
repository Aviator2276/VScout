// Settings → Recently Deleted (ADR-029): my deletes from the last 30 days that kept a snapshot, so
// they can be restored. Server-side deletes by others never carry a snapshot.
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { useCollectionState } from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import type { TombstoneRow } from "@/lib/db/types"
import { entityName } from "@/lib/sync/conflict-view"

export const RECENTLY_DELETED_DAYS = 30
const DAY = 86_400_000

export interface DeletedItem {
  key: string
  entity: string
  id: string
  title: string
  deletedAt: number
}

function titleOf(t: TombstoneRow): string {
  const s = (t.snapshot ?? {}) as Record<string, unknown>
  const team = typeof s.teamNumber === "number" ? `Team ${s.teamNumber}` : null
  const name =
    typeof s.name === "string"
      ? s.name
      : typeof s.body === "string"
        ? s.body.slice(0, 60)
        : null
  const kind = entityName(t.entity)
  return [team, name, kind.charAt(0).toUpperCase() + kind.slice(1)]
    .filter(Boolean)
    .join(" · ")
}

export function useRecentlyDeleted(
  now: number
): DataState<ReadonlyArray<DeletedItem>> {
  const { db, viewer } = useDataRuntime()
  const userId = viewer?.()?.userId
  const since = now - RECENTLY_DELETED_DAYS * DAY
  return useCollectionState({
    enabled: true,
    source: [],
    deps: [userId, Math.floor(since / DAY)],
    share: (v) => `${v.key}:${v.deletedAt}`,
    query: async () =>
      (await db.tombstones.where("deletedAt").above(since).toArray())
        .filter((t) => {
          const s = t.snapshot as { authorId?: unknown } | undefined
          return (
            s !== undefined &&
            (s.authorId === undefined || s.authorId === userId)
          )
        })
        .sort((a, b) => b.deletedAt - a.deletedAt)
        .map((t) => ({
          key: `${t.entity}:${t.id}`,
          entity: t.entity,
          id: t.id,
          title: titleOf(t),
          deletedAt: t.deletedAt,
        })),
  })
}
