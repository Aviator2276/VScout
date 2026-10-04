import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/controls/button"
import { DataView } from "@/components/data-view/data-view"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { useEventSettings } from "@/features/admin/api/get-admin"
import { usePicklists } from "@/features/picklists/api/get-picklists"
import { useOnline } from "@/hooks/use-online"
import { useAdminActions } from "@/lib/db/react/data-runtime"
import type { EventSettingsRecord } from "@/lib/db/types"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/admin/event"
)({
  component: EventSetup,
})

// AD3: scouting open, the master picklist (ADR-080), post-scouting early. Saved as one queued eventSettings
// write with baseRev; a concurrent admin edit opens the conflict sheet (Settings → Sync Conflicts).
function EventSetup() {
  const { event } = Route.useRouteContext()
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
            const master = lists.find((p) => p.master && p.purpose === "first")
            // the old admin pointer (before ADR-080): still honored until a master list exists
            const legacy = lists.find((p) => p.id === s.followedPicklistId)
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
                <List.Section
                  footer={
                    master
                      ? "The master first-pick list is followed by everyone and used at alliance selection."
                      : "Build the master list from everyone’s votes. Once it exists, the team follows it."
                  }
                >
                  <List.Row
                    title="Master picklist"
                    detail={
                      master
                        ? `${master.teamCount} ${master.teamCount === 1 ? "team" : "teams"}`
                        : "Not started"
                    }
                    href="/scout/picklists/vote"
                  />
                  {!master && legacy ? (
                    <List.Row
                      title={`Stop Following “${legacy.name}”`}
                      detail={online ? undefined : "Needs connection"}
                      {...(online
                        ? {
                            onSelect: () =>
                              void admin.patchEventSettings(event.key, {
                                followedPicklistId: null,
                              }),
                          }
                        : {})}
                    />
                  ) : null}
                </List.Section>
              </>
            )
          }}
        </DataView.Success>
      </DataView>
    </StackPage>
  )
}
