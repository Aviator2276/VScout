import { createFileRoute } from "@tanstack/react-router"
import { NotificationSettingsPanel } from "@/app/notification-center-runtime"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"

// Kept for old links and push deep links; Settings → Notifications opens the notification
// center's settings view instead (notifications-center.md N3).
export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/notifications"
)({
  component: Notifications,
})

function Notifications() {
  const { app } = Route.useRouteContext()
  return (
    <StackPage
      title="Notifications"
      leading={<NavBackButton parentHref="/settings" label="Settings" />}
    >
      <NotificationSettingsPanel app={app()} />
    </StackPage>
  )
}
