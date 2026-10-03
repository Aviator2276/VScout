import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { Button } from "@/components/controls/button"
import { DataView } from "@/components/data-view/data-view"
import { Check } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { Sheet } from "@/components/overlays/sheet"
import { useEventSettings } from "@/features/admin/api/get-admin"
import { usePicklists } from "@/features/picklists/api/get-picklists"
import { useOnline } from "@/hooks/use-online"
import { useAdminActions } from "@/lib/db/react/data-runtime"
import type { EventSettingsRecord } from "@/lib/db/types"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/admin/event"
)({
  validateSearch: z.object({
    sheet: z.enum(["followed-picklist"]).optional().catch(undefined),
  }),
  component: EventSetup,
})

// AD3: scouting open, followed picklist, post-scouting early. Saved as one queued eventSettings
// write with baseRev; a concurrent admin edit opens the conflict sheet (Settings → Sync Conflicts).
function EventSetup() {
  const { event } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const settings = useEventSettings(event.key)
  const admin = useAdminActions()
  const online = useOnline()
  const picklists = usePicklists(event.key)
  const lists = picklists.status === "success" ? picklists.data : []
  return (
    <StackPage
      title="Event Setup"
      leading={<NavBackButton parentHref="/settings/admin" label="Admin" />}
    >
      <DataView state={settings} size="page">
        <DataView.Missing
          not-found={{
            title: "Settings for this event haven’t been created.",
            action: (
              <Button
                onClick={() =>
                  void admin.patchEventSettings(event.key, {
                    scoutingOpen: true,
                  })
                }
              >
                Create with Defaults
              </Button>
            ),
          }}
        />
        <DataView.Error title="Couldn’t load event settings." />
        <DataView.Success>
          {(s: EventSettingsRecord) => {
            const followed = lists.find((p) => p.id === s.followedPicklistId)
            return (
              <>
                <List.Section title="Event">
                  <List.Row title="Event" detail={event.name} />
                </List.Section>
                <List.Section footer="When scouting is closed, scouters can’t start new forms.">
                  <List.Toggle
                    title="Scouting open"
                    checked={s.scoutingOpen}
                    onCheckedChange={(scoutingOpen) =>
                      void admin.patchEventSettings(event.key, { scoutingOpen })
                    }
                  />
                  <List.Toggle
                    title="Post-scouting opens early"
                    checked={s.postScouting?.openEarly ?? false}
                    onCheckedChange={(openEarly) =>
                      void admin.patchEventSettings(event.key, {
                        postScouting: { openEarly },
                      })
                    }
                  />
                </List.Section>
                <List.Section footer="The followed picklist shows first for everyone.">
                  <List.Row
                    title="Followed picklist"
                    detail={
                      online ? (followed?.name ?? "None") : "Needs connection"
                    }
                    {...(online
                      ? {
                          onSelect: () =>
                            void navigate({
                              search: { sheet: "followed-picklist" },
                            }),
                        }
                      : {})}
                  />
                </List.Section>
                <Sheet
                  open={search.sheet === "followed-picklist"}
                  onOpenChange={(o) =>
                    o ? undefined : void navigate({ search: {}, replace: true })
                  }
                >
                  <Sheet.Content title="Followed Picklist" closeLabel="Done">
                    {lists.length === 0 ? (
                      <p className="py-6 text-center text-muted-foreground">
                        No picklists yet.
                      </p>
                    ) : (
                      <List.Section>
                        <List.Row
                          title="None"
                          detail={
                            s.followedPicklistId ? undefined : (
                              <Check aria-label="Selected" size={18} />
                            )
                          }
                          onSelect={() =>
                            void admin.patchEventSettings(event.key, {
                              followedPicklistId: null,
                            })
                          }
                        />
                        {lists.map((p) => (
                          <List.Row
                            key={p.id}
                            title={p.name}
                            subtitle={`${p.ownerName} · ${p.teamCount} teams`}
                            detail={
                              p.id === s.followedPicklistId ? (
                                <Check aria-label="Selected" size={18} />
                              ) : undefined
                            }
                            onSelect={() =>
                              void admin.patchEventSettings(event.key, {
                                followedPicklistId: p.id,
                              })
                            }
                          />
                        ))}
                      </List.Section>
                    )}
                  </Sheet.Content>
                </Sheet>
              </>
            )
          }}
        </DataView.Success>
      </DataView>
    </StackPage>
  )
}
