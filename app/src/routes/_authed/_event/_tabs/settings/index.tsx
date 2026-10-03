import { createFileRoute } from "@tanstack/react-router"
import { useSyncExternalStore } from "react"
import { usePushState } from "@/app/use-push-state"
import { Segmented } from "@/components/controls/segmented"
import { useGlossary } from "@/components/glossary/glossary-provider"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { FEEDBACK_ENABLED } from "@/config/feedback"
import { APP_VERSION } from "@/config/version"
import { useHomeLayout } from "@/features/home-widgets/api/use-home-layout"
import { templateName } from "@/features/home-widgets/utils/templates"
import { useOpenConflicts } from "@/hooks/use-conflicts"
import { useOurTeam } from "@/hooks/use-our-team"
import { usePrefs, useSetPrefs } from "@/hooks/use-prefs"
import { useSession } from "@/hooks/use-session"
import { can } from "@/lib/authorization"
import { useNotificationCenter } from "@/features/notifications/components/notification-center"
import { initials } from "@/utils/initials"

export const Route = createFileRoute("/_authed/_event/_tabs/settings/")({
  component: Settings,
})

const ROLE_LABEL = { admin: "Admin", scouter: "Scouter", guest: "Guest" }
const THEME_LABEL = { system: "System", light: "Light", dark: "Dark" }
const PUSH_LABEL = {
  subscribed: "On",
  "can-prompt": "Off",
  snoozed: "Off",
  "needs-tap": "Almost on",
  denied: "Blocked",
  "needs-install": "Needs install",
  unsupported: "Not available",
} as const

// Settings (features/settings.md S0): one row per section with its current value.
function Settings() {
  const { app, event } = Route.useRouteContext()
  const runtime = app()
  const session = useSession(runtime.auth)
  const prefs = usePrefs()
  const setPrefs = useSetPrefs()
  const ourTeam = useOurTeam()
  const layout = useHomeLayout()
  const push = usePushState(runtime)
  const center = useNotificationCenter()
  const open = useOpenConflicts()
  const conflicts = open.status === "success" ? open.data.length : 0
  const guest = session?.role === "guest"
  const pending = useSyncExternalStore(
    runtime.sync.status.subscribe,
    () => runtime.sync.status.getSnapshot().phase,
    () => "idle"
  )
  const glossary = useGlossary()
  const help = prefs.help ?? {
    underline: "all",
    openWith: "long-press",
    completedGuides: [],
  }

  return (
    <StackPage
      title="Settings"
      leading={<NavBackButton parentHref="/" label="Home" />}
    >
      <List.Section>
        <List.Row
          title={session?.displayName ?? "Signed in"}
          subtitle={
            guest
              ? "Guest · this device"
              : `${session ? ROLE_LABEL[session.role] : ""}${ourTeam ? ` · ${ourTeam}` : ""}`
          }
          leading={
            <span
              aria-hidden
              className="flex size-11 items-center justify-center rounded-full bg-primary text-headline text-primary-foreground"
            >
              {initials(session?.displayName ?? "?")}
            </span>
          }
          href="/settings/account"
        />
      </List.Section>
      <List.Section title="Event">
        <List.Row title="Event" detail={event.name} href="/settings/event" />
      </List.Section>
      <List.Section title="Preferences">
        {guest ? null : (
          <List.Row
            title="Scouting"
            detail={
              prefs.scouterLevel === "new"
                ? "Experience: New"
                : "Experience: Experienced"
            }
            href="/settings/scouting"
          />
        )}
        <List.Row
          title="Appearance"
          detail={THEME_LABEL[prefs.theme]}
          href="/settings/appearance"
        />
        {/* opens the notification center on its settings view (notifications-center.md N3) */}
        <List.Row
          title="Notifications"
          detail={PUSH_LABEL[push]}
          {...(center
            ? { onSelect: () => center.open("settings") }
            : { href: "/settings/notifications" })}
        />
        <List.Row
          title="Home Layout"
          detail={
            layout.active.kind === "template"
              ? templateName(layout.active.templateId)
              : "Custom"
          }
          href="/settings/home-layout"
        />
      </List.Section>
      <List.Section title="Help & Glossary">
        <li className="flex flex-col gap-2 px-4 py-2">
          <span className="text-subhead text-muted-foreground">
            Underline glossary words
          </span>
          <Segmented
            label="Underline glossary words"
            value={help.underline ?? "all"}
            onValueChange={(underline) =>
              void setPrefs({ help: { ...help, underline } })
            }
            options={[
              { value: "all", label: "All" },
              { value: "first", label: "First" },
              { value: "off", label: "Off" },
            ]}
          />
          <span className="text-subhead text-muted-foreground">
            Open glossary with
          </span>
          <Segmented
            label="Open glossary with"
            value={help.openWith}
            onValueChange={(openWith) =>
              void setPrefs({ help: { ...help, openWith } })
            }
            options={[
              { value: "long-press", label: "Long Press" },
              { value: "tap", label: "Tap" },
            ]}
          />
        </li>
        <List.Row
          title="Open Help"
          onSelect={() => glossary?.open("glossary")}
        />
      </List.Section>
      <List.Section title="Storage & Diagnostics">
        <List.Row
          title="Storage & Diagnostics"
          detail={pending === "offline" ? "Offline" : undefined}
          href="/settings/storage"
        />
        {conflicts > 0 ? (
          <List.Row
            title="Sync Conflicts"
            detail={String(conflicts)}
            href="/settings/conflicts"
          />
        ) : null}
        {guest ? null : (
          <List.Row
            title="Recently Deleted"
            href="/settings/recently-deleted"
          />
        )}
      </List.Section>
      <List.Section title="About">
        <List.Row
          title="About VScout"
          detail={APP_VERSION}
          href="/settings/about"
        />
        {FEEDBACK_ENABLED ? (
          <List.Row title="Send Feedback" href="/settings/feedback" />
        ) : null}
      </List.Section>
      {session && can(session, "admin:access") ? (
        <List.Section title="Admin">
          <List.Row title="Admin Overview" href="/settings/admin" />
          <List.Row title="Event Setup" href="/settings/admin/event" />
          <List.Row
            title="Announcements"
            href="/settings/admin/announcements"
          />
          <List.Row title="Users & Roles" href="/settings/admin/users" />
        </List.Section>
      ) : null}
    </StackPage>
  )
}
