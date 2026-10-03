import { Link, createFileRoute } from "@tanstack/react-router"
import { useSyncExternalStore } from "react"
import { useAdminCoverage } from "@/app/admin-coverage"
import {
  Activity,
  Bell,
  CalendarDays,
  ChartColumn,
  Download,
  Flag,
  FlaskConical,
  Hash,
  KeyRound,
  ListOrdered,
  Megaphone,
  UsersRound,
} from "@/components/icons/icon"
import type { LucideIcon } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { useEventSettings, useTeamNumber } from "@/features/admin/api/get-admin"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authed/_event/_tabs/settings/admin/")({
  component: AdminOverview,
})

type Tone = Parameters<typeof List.Icon>[0]["tone"]

const GROUPS: ReadonlyArray<{
  title: string
  rows: ReadonlyArray<{
    title: string
    path: string
    icon: LucideIcon
    tone: Tone
  }>
}> = [
  {
    title: "Event",
    rows: [
      { title: "Event Setup", path: "event", icon: CalendarDays, tone: "blue" },
      { title: "Team Number", path: "team", icon: Hash, tone: "indigo" },
      {
        title: "Guest Access",
        path: "guest-access",
        icon: KeyRound,
        tone: "orange",
      },
    ],
  },
  {
    title: "People",
    rows: [
      { title: "Users & Roles", path: "users", icon: UsersRound, tone: "teal" },
      {
        title: "Announcements",
        path: "announcements",
        icon: Megaphone,
        tone: "red",
      },
    ],
  },
  {
    title: "Selection",
    rows: [
      {
        title: "Live Alliance Board",
        path: "alliance-board",
        icon: ListOrdered,
        tone: "green",
      },
    ],
  },
  {
    title: "Data",
    rows: [
      {
        title: "Data Quality",
        path: "data-quality",
        icon: ChartColumn,
        tone: "purple",
      },
      { title: "Moderation", path: "moderation", icon: Flag, tone: "orange" },
      { title: "Export", path: "export", icon: Download, tone: "gray" },
      {
        title: "Demo Data",
        path: "demo",
        icon: FlaskConical,
        tone: "indigo",
      },
    ],
  },
  {
    title: "Diagnostics",
    rows: [
      { title: "Push Notifications", path: "push", icon: Bell, tone: "red" },
      {
        title: "Sync Health",
        path: "sync-health",
        icon: Activity,
        tone: "gray",
      },
    ],
  },
]

/** A glanceable number on the admin page (iOS widget-like): value, label, a tap goes deeper. */
function StatTile({
  label,
  value,
  tone = "neutral",
  href,
}: {
  label: string
  value: string
  tone?: "neutral" | "good" | "warn"
  href: string
}) {
  return (
    <Link
      to={href}
      className="flex min-h-20 flex-col justify-between rounded-2xl bg-card p-3 shadow-xs transition-[scale] active:scale-[0.98] active:bg-muted"
    >
      <span className="text-footnote text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-heading text-title-2 tabular-nums",
          tone === "good" && "text-success",
          tone === "warn" && "text-warning"
        )}
      >
        {value}
      </span>
    </Link>
  )
}

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
      {/* status at a glance (owner: freshen it up like Settings) */}
      <section aria-label="Status" className="mt-2 grid grid-cols-2 gap-2">
        <StatTile
          label="Scouting"
          value={s ? (s.scoutingOpen ? "Open" : "Closed") : "…"}
          tone={s ? (s.scoutingOpen ? "good" : "warn") : "neutral"}
          href="/settings/admin/event"
        />
        <StatTile
          label="Coverage"
          value={cov ? (cov.percent === null ? "—" : `${cov.percent}%`) : "…"}
          href="/settings/admin/data-quality"
        />
        <StatTile
          label="Online now"
          value={mqtt ? String(people) : "—"}
          href="/settings/admin/sync-health"
        />
        <StatTile
          label="Guests"
          value={s ? (s.guestAccess.enabled ? "On" : "Off") : "…"}
          href="/settings/admin/guest-access"
        />
      </section>
      {GROUPS.map((g) => (
        <List.Section key={g.title} title={g.title}>
          {g.rows.map((r) => (
            <List.Row
              key={r.path}
              title={r.title}
              leading={<List.Icon icon={r.icon} tone={r.tone} />}
              detail={
                r.path === "team"
                  ? teamNumber === undefined
                    ? undefined
                    : (teamNumber ?? "Not set")
                  : undefined
              }
              href={`/settings/admin/${r.path}`}
            />
          ))}
        </List.Section>
      ))}
    </StackPage>
  )
}
