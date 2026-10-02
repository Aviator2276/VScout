import { createFileRoute } from "@tanstack/react-router"
import { useSyncExternalStore } from "react"
import { useAdminCoverage } from "@/app/admin-coverage"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { useEventSettings, useTeamNumber } from "@/features/admin/api/get-admin"

export const Route = createFileRoute("/_authed/_event/_tabs/settings/admin/")({
  component: AdminOverview,
})

const GROUPS: ReadonlyArray<{
  title: string
  rows: ReadonlyArray<readonly [string, string]>
}> = [
  {
    title: "Event",
    rows: [
      ["Event Setup", "event"],
      ["Team Number", "team"],
      ["Guest Access", "guest-access"],
    ],
  },
  {
    title: "People",
    rows: [
      ["Users & Roles", "users"],
      ["Announcements", "announcements"],
    ],
  },
  { title: "Selection", rows: [["Live Alliance Board", "alliance-board"]] },
  {
    title: "Data",
    rows: [
      ["Data Quality", "data-quality"],
      ["Moderation", "moderation"],
      ["Export", "export"],
    ],
  },
  {
    title: "Diagnostics",
    rows: [
      ["Push Notifications", "push"],
      ["Sync Health", "sync-health"],
    ],
  },
]

// AD1: status at a glance, then every admin page.
function AdminOverview() {
  const { event, app } = Route.useRouteContext()
  const runtime = app()
  const settings = useEventSettings(event.key)
  const teamNumber = useTeamNumber()
  const coverage = useAdminCoverage(event.key)
  const online = useSyncExternalStore(
    runtime.presence.subscribe,
    runtime.presence.getSnapshot,
    () => new Map()
  )
  const mqtt = useSyncExternalStore(
    runtime.mqttStatus.subscribe,
    runtime.mqttStatus.getSnapshot,
    () => null
  )
  // never created yet: the defaults apply (AD3 missing state is on Event Setup)
  const s =
    settings.status === "success"
      ? settings.data
      : settings.status === "missing"
        ? { scoutingOpen: true, guestAccess: { enabled: false } }
        : null
  const cov = coverage.status === "success" ? coverage.data : null
  const people = new Set(
    [...online.values()]
      .filter((p) => p.status !== "offline")
      .map((p) => p.userId)
  ).size
  return (
    <StackPage
      title="Admin"
      leading={<NavBackButton parentHref="/settings" label="Settings" />}
    >
      <List.Section title="Status">
        <List.Row title="Event" detail={event.name} />
        <List.Row
          title="Scouting"
          detail={s ? (s.scoutingOpen ? "Open" : "Closed") : "…"}
        />
        <List.Row
          title="Coverage"
          detail={
            cov
              ? cov.percent === null
                ? "No matches played"
                : `${cov.percent}% of played robots`
              : "…"
          }
        />
        <List.Row
          title="Team number"
          detail={teamNumber === undefined ? "…" : (teamNumber ?? "Not set")}
        />
        <List.Row
          title="Guests"
          detail={s ? (s.guestAccess.enabled ? "On" : "Off") : "…"}
        />
        <List.Row
          title="Online now"
          detail={mqtt ? String(people) : "Not connected"}
        />
      </List.Section>
      {GROUPS.map((g) => (
        <List.Section key={g.title} title={g.title}>
          {g.rows.map(([title, path]) => (
            <List.Row
              key={path}
              title={title}
              href={`/settings/admin/${path}`}
            />
          ))}
        </List.Section>
      ))}
    </StackPage>
  )
}
