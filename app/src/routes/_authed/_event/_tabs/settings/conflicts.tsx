import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { DataView } from "@/components/data-view/data-view"
import { CloudCheck } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { ConflictSheet } from "@/components/sync/conflict-sheet"
import { useOpenConflicts, useResolveConflict } from "@/hooks/use-conflicts"
import type { ConflictView } from "@/lib/sync/conflict-view"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/conflicts"
)({
  component: Conflicts,
})

// Settings → Sync Conflicts (features/settings.md): every open conflict on this device.
function Conflicts() {
  const state = useOpenConflicts()
  const resolve = useResolveConflict()
  const navigate = Route.useNavigate()
  const [open, setOpen] = useState<ConflictView | null>(null)
  const shown =
    state.status === "success" && state.data.length === 0
      ? ({ status: "empty" } as const)
      : state
  return (
    <StackPage
      title="Sync Conflicts"
      leading={<NavBackButton parentHref="/settings" label="Settings" />}
    >
      <DataView state={shown} size="page">
        <DataView.Empty icon={CloudCheck} title="No conflicts" />
        <DataView.Error title="Couldn’t load conflicts." />
        <DataView.Success>
          {(list: ReadonlyArray<ConflictView>) => (
            <List.Section footer="Your version and the server’s disagree. Choose which one to keep.">
              {list.map((v) => (
                <List.Row
                  key={v.conflict.id}
                  title={v.title}
                  subtitle={v.summary}
                  onSelect={() => setOpen(v)}
                />
              ))}
            </List.Section>
          )}
        </DataView.Success>
      </DataView>
      <ConflictSheet
        view={open}
        onOpenChange={(o) => {
          if (!o) setOpen(null)
        }}
        onAction={async (action) => {
          if (!open) return
          if (action === "edit-and-retry") {
            setOpen(null)
            void navigate({
              to: "/scouting/mine",
              search: { show: "attention" },
            })
            return
          }
          await resolve(open.conflict.id, action)
          setOpen(null)
        }}
      />
    </StackPage>
  )
}
