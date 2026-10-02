import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { useToast } from "@/components/overlays/toaster"
import { ConflictSheet } from "@/components/sync/conflict-sheet"
import {
  useDeleteEntry,
  useDiscardDraft,
  useMyEntries,
} from "@/features/scouting/api/get-my-entries"
import { useMyDrafts } from "@/features/scouting/api/get-recommendations"
import { MyEntriesView } from "@/features/scouting/components/my-entries-view"
import { useOpenConflicts, useResolveConflict } from "@/hooks/use-conflicts"

export const Route = createFileRoute("/_authed/_event/scouting/mine")({
  validateSearch: z.object({
    show: z
      .enum(["drafts", "pending", "synced", "attention"])
      .optional()
      .catch(undefined),
  }),
  component: MyEntries,
})

function MyEntries() {
  const { event } = Route.useRouteContext()
  const { show } = Route.useSearch()
  const navigate = Route.useNavigate()
  const toast = useToast()
  const entries = useMyEntries(event.key)
  const drafts = useMyDrafts(event.key)
  const del = useDeleteEntry()
  const discard = useDiscardDraft()
  const conflicts = useOpenConflicts()
  const resolve = useResolveConflict()
  const [open, setOpen] = useState<string | null>(null)
  const view =
    conflicts.status === "success"
      ? (conflicts.data.find((c) => c.conflict.recordId === open) ?? null)
      : null
  return (
    <StackPage
      title="My Entries"
      leading={<NavBackButton parentHref="/scout" label="Scout" />}
    >
      <MyEntriesView
        segment={show ?? "synced"}
        onSegmentChange={(s) =>
          void navigate({ search: { show: s }, replace: true })
        }
        entries={entries}
        drafts={drafts}
        onDelete={async (e) => {
          await del(e)
          toast.show({ title: "Entry deleted" })
        }}
        onDiscard={async (id) => {
          await discard(id)
          toast.show({ title: "Draft discarded" })
        }}
        onResolve={setOpen}
      />
      <ConflictSheet
        view={view}
        onOpenChange={(o) => {
          if (!o) setOpen(null)
        }}
        onAction={async (action) => {
          if (!view) return
          if (action === "edit-and-retry") {
            setOpen(null)
            const local = view.conflict.local as {
              matchKey?: string
              teamNumber?: number
            }
            void navigate({
              href:
                view.conflict.entity === "scoutEntry"
                  ? `/scouting/match/${local.matchKey ?? ""}/${local.teamNumber ?? ""}`
                  : `/scouting/${view.conflict.entity === "pitScouting" ? "pit" : "post"}/${local.teamNumber ?? ""}`,
            })
            return
          }
          await resolve(view.conflict.id, action)
          setOpen(null)
        }}
      />
    </StackPage>
  )
}
