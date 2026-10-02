import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { DataView } from "@/components/data-view/data-view"
import { Trash2 } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { useToast } from "@/components/overlays/toaster"
import { formatAgo } from "@/components/sync/sync-badge"
import { useNow } from "@/hooks/use-now"
import { useOnline } from "@/hooks/use-online"
import {
  RECENTLY_DELETED_DAYS,
  useRecentlyDeleted,
} from "@/hooks/use-recently-deleted"
import type { DeletedItem } from "@/hooks/use-recently-deleted"
import { requirePermission } from "@/lib/authorization"
import { useLiveActions } from "@/lib/db/react/data-runtime"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/recently-deleted"
)({
  beforeLoad: ({ context }) => {
    requirePermission(context.session, "scouting:create")
  },
  component: RecentlyDeleted,
})

// Settings → Recently Deleted (features/settings.md, ADR-029): Restore brings back the same record.
function RecentlyDeleted() {
  const now = useNow(60_000)
  const state = useRecentlyDeleted(now)
  const live = useLiveActions()
  const online = useOnline()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const shown =
    state.status === "success" && state.data.length === 0
      ? ({ status: "empty" } as const)
      : state

  const restore = async (item: DeletedItem) => {
    setBusy(item.key)
    const r = await live.restore(item.entity, item.id)
    setBusy(null)
    if (r.kind === "ok") toast.show({ title: "Restored" })
    else
      toast.show({
        title:
          r.kind === "offline"
            ? "You’re offline. Restore when you’re connected."
            : r.code === "delete_syncing"
              ? r.message
              : "Couldn’t restore it. Try again.",
      })
  }

  return (
    <StackPage
      title="Recently Deleted"
      leading={<NavBackButton parentHref="/settings" label="Settings" />}
    >
      <DataView state={shown} size="page">
        <DataView.Empty
          icon={Trash2}
          title={`Nothing deleted in the last ${RECENTLY_DELETED_DAYS} days`}
        />
        <DataView.Error title="Couldn’t load deleted items." />
        <DataView.Success>
          {(list: ReadonlyArray<DeletedItem>) => (
            <List.Section
              footer={`Items stay here for ${RECENTLY_DELETED_DAYS} days.${online ? "" : " Restoring needs a connection unless the delete hasn’t synced yet."}`}
            >
              {list.map((item) => (
                <List.Row
                  key={item.key}
                  title={item.title}
                  subtitle={`Deleted ${formatAgo(now - item.deletedAt)}`}
                  detail={busy === item.key ? "Restoring…" : "Restore"}
                  onSelect={() => void restore(item)}
                />
              ))}
            </List.Section>
          )}
        </DataView.Success>
      </DataView>
    </StackPage>
  )
}
