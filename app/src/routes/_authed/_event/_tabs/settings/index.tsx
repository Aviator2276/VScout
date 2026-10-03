import { createFileRoute } from "@tanstack/react-router"
import { useSyncExternalStore } from "react"
import { usePushState } from "@/app/use-push-state"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import {
  Bell,
  CalendarDays,
  CircleHelp,
  ClipboardList,
  HardDrive,
  Info,
  LayoutGrid,
  MessageSquareText,
  Palette,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "@/components/icons/icon"
import { List } from "@/components/list/list"
import { useFeedback } from "@/features/feedback/components/feedback-sheet"
import { APP_VERSION } from "@/config/version"
import { useHomeLayout } from "@/features/home-widgets/api/use-home-layout"
import { templateName } from "@/features/home-widgets/utils/templates"
import { useOpenConflicts } from "@/hooks/use-conflicts"
import { useOurTeam } from "@/hooks/use-our-team"
import { usePrefs } from "@/hooks/use-prefs"
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

// Settings (features/settings.md S0, reorganized FX-30): iOS-style groups with icon tiles, one row
// per section with its current value; details live one level down.
function Settings() {
  const { app, event } = Route.useRouteContext()
  const runtime = app()
  const session = useSession(runtime.auth)
  const prefs = usePrefs()
  const ourTeam = useOurTeam()
  const layout = useHomeLayout()
  const push = usePushState(runtime)
  const center = useNotificationCenter()
  const feedback = useFeedback()
  const open = useOpenConflicts()
  const conflicts = open.status === "success" ? open.data.length : 0
  const guest = session?.role === "guest"
  const pending = useSyncExternalStore(
    runtime.sync.status.subscribe,
    () => runtime.sync.status.getSnapshot().phase,
    () => "idle"
  )

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
              : `${session ? ROLE_LABEL[session.role] : ""}${ourTeam ? ` · Team ${ourTeam}` : ""}`
          }
          leading={
            <span
              aria-hidden
              className="flex size-12 items-center justify-center rounded-full bg-primary text-headline text-primary-foreground"
            >
              {initials(session?.displayName ?? "?")}
            </span>
          }
          href="/settings/account"
        />
      </List.Section>

      <List.Section title="Event">
        <List.Row
          title="Event"
          detail={event.name}
          leading={<List.Icon icon={CalendarDays} tone="blue" />}
          href="/settings/event"
        />
      </List.Section>

      <List.Section title="Preferences">
        {guest ? null : (
          <List.Row
            title="Scouting"
            detail={prefs.scouterLevel === "new" ? "New" : "Experienced"}
            leading={<List.Icon icon={ClipboardList} tone="green" />}
            href="/settings/scouting"
          />
        )}
        {/* opens the notification center on its settings view (notifications-center.md N3) */}
        <List.Row
          title="Notifications"
          detail={PUSH_LABEL[push]}
          leading={<List.Icon icon={Bell} tone="red" />}
          {...(center
            ? { onSelect: () => center.open("settings") }
            : { href: "/settings/notifications" })}
        />
        <List.Row
          title="Appearance"
          detail={THEME_LABEL[prefs.theme]}
          leading={<List.Icon icon={Palette} tone="indigo" />}
          href="/settings/appearance"
        />
        <List.Row
          title="Home Screen"
          detail={
            layout.active.kind === "template"
              ? templateName(layout.active.templateId)
              : "Custom"
          }
          leading={<List.Icon icon={LayoutGrid} tone="purple" />}
          href="/settings/home-layout"
        />
      </List.Section>

      <List.Section title="Help & Feedback">
        <List.Row
          title="Help & Glossary"
          leading={<List.Icon icon={CircleHelp} tone="teal" />}
          href="/settings/help"
        />
        {feedback ? (
          <List.Row
            title="Send Feedback"
            leading={<List.Icon icon={MessageSquareText} tone="orange" />}
            onSelect={feedback.open}
          />
        ) : null}
        <List.Row
          title="About VScout"
          detail={APP_VERSION}
          leading={<List.Icon icon={Info} tone="gray" />}
          href="/settings/about"
        />
      </List.Section>

      <List.Section title="Data & Storage">
        <List.Row
          title="Storage & Diagnostics"
          detail={pending === "offline" ? "Offline" : undefined}
          leading={<List.Icon icon={HardDrive} tone="gray" />}
          href="/settings/storage"
        />
        {conflicts > 0 ? (
          <List.Row
            title="Sync Conflicts"
            detail={String(conflicts)}
            leading={<List.Icon icon={TriangleAlert} tone="orange" />}
            href="/settings/conflicts"
          />
        ) : null}
        {guest ? null : (
          <List.Row
            title="Recently Deleted"
            leading={<List.Icon icon={Trash2} tone="gray" />}
            href="/settings/recently-deleted"
          />
        )}
      </List.Section>

      {session && can(session, "admin:access") ? (
        <List.Section
          title="Admin"
          footer="Event setup, users and roles, announcements, data quality and more."
        >
          <List.Row
            title="Admin"
            leading={<List.Icon icon={ShieldCheck} tone="blue" />}
            href="/settings/admin"
          />
        </List.Section>
      ) : null}
    </StackPage>
  )
}
