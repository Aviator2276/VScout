import { createFileRoute } from "@tanstack/react-router"
import { usePushState } from "@/app/use-push-state"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { useToast } from "@/components/overlays/toaster"
import { NotificationSettings } from "@/features/notifications/components/notification-settings"
import { usePrefs, useSetPrefs } from "@/hooks/use-prefs"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/notifications"
)({
  component: Notifications,
})

function Notifications() {
  const { app, session } = Route.useRouteContext()
  const runtime = app()
  const state = usePushState(runtime)
  const prefs = usePrefs()
  const setPrefs = useSetPrefs()
  const toast = useToast()
  return (
    <StackPage
      title="Notifications"
      leading={<NavBackButton parentHref="/settings" label="Settings" />}
    >
      <NotificationSettings
        state={state}
        prefs={prefs.notifications}
        guest={session.role === "guest"}
        onEnable={() => void runtime.push.enable()}
        onDisable={() => void runtime.push.disable()}
        onTest={() =>
          void runtime.push
            .test()
            .then(() =>
              toast.show({
                title: "Test sent. It should arrive in a few seconds.",
              })
            )
            .catch(() =>
              toast.show({
                title: "Couldn’t send a test. Check your connection.",
              })
            )
        }
        onChange={(patch) =>
          void setPrefs({ notifications: { ...prefs.notifications, ...patch } })
        }
      />
    </StackPage>
  )
}
