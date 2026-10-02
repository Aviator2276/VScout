import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { ToolbarButton } from "@/components/controls/toolbar-button"
import { Plus } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { useToast } from "@/components/overlays/toaster"
import {
  usePicklistWrites,
  usePicklists,
} from "@/features/picklists/api/get-picklists"
import {
  NewPicklistSheet,
  PicklistsView,
} from "@/features/picklists/components/picklists-view"
import { useNow } from "@/hooks/use-now"
import { can } from "@/lib/authorization"

export const Route = createFileRoute("/_authed/_event/_tabs/scout/picklists/")({
  validateSearch: z.object({
    sheet: z.enum(["new"]).optional().catch(undefined),
    owner: z.enum(["me", "all"]).optional().catch(undefined),
  }),
  component: Picklists,
})

function Picklists() {
  const { event, session } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const go = useNavigate()
  const toast = useToast()
  const canCreate = can(session, "picklist:create")
  const state = usePicklists(event.key)
  const writes = usePicklistWrites(event.key)
  const now = useNow(60_000)
  return (
    <StackPage
      title="Picklists"
      leading={<NavBackButton parentHref="/scout" label="Scout" />}
      trailing={
        canCreate ? (
          <ToolbarButton
            label="New Picklist"
            onClick={() =>
              void navigate({ search: (p) => ({ ...p, sheet: "new" }) })
            }
          >
            <Plus aria-hidden size={24} />
          </ToolbarButton>
        ) : undefined
      }
    >
      <PicklistsView
        state={state}
        owner={canCreate ? (search.owner ?? "all") : "all"}
        onOwnerChange={(owner) =>
          void navigate({
            search: (p) => ({
              ...p,
              owner: owner === "all" ? undefined : owner,
            }),
            replace: true,
          })
        }
        canCreate={canCreate}
        now={now}
      />
      <List.Section>
        <List.Row title="Combined Picklist" href="/scout/picklists/combined" />
      </List.Section>
      {canCreate ? (
        <NewPicklistSheet
          open={search.sheet === "new"}
          onOpenChange={(open) => {
            if (!open)
              void navigate({
                search: (p) => ({ ...p, sheet: undefined }),
                replace: true,
              })
          }}
          onCreate={async (input) => {
            try {
              const list = await writes.create(input)
              void go({
                to: "/scout/picklists/$picklistId",
                params: { picklistId: list.id },
                replace: true,
              })
            } catch {
              toast.show({ title: "Couldn’t create the picklist. Try again." })
            }
          }}
        />
      ) : null}
    </StackPage>
  )
}
