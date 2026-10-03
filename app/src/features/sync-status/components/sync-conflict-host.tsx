// The conflict sheet opened from the Sync details (features/sync-status.md S3), mounted once by the
// app shell: Keep Mine / Keep Theirs / Edit / Discard, as in Settings → Sync Conflicts.
import { useSyncExternalStore } from "react"
import { ConflictSheet } from "@/components/sync/conflict-sheet"
import { useResolveConflict } from "@/hooks/use-conflicts"
import { conflictStore } from "../stores/conflict"

export function SyncConflictHost({
  onNavigate,
}: {
  onNavigate: (href: string) => void
}) {
  const view = useSyncExternalStore(
    conflictStore.subscribe,
    conflictStore.getSnapshot,
    () => null
  )
  const resolve = useResolveConflict()
  return (
    <ConflictSheet
      view={view}
      onOpenChange={(o) => {
        if (!o) conflictStore.set(null)
      }}
      onAction={async (action) => {
        if (!view) return
        if (action === "edit-and-retry") {
          conflictStore.set(null)
          onNavigate("/scouting/mine?show=attention")
          return
        }
        await resolve(view.conflict.id, action)
        conflictStore.set(null)
      }}
    />
  )
}
