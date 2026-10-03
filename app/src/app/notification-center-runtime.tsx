// Wires the notification center into the app (features/notifications-center.md N3): the settings
// it shows (this device's push state + the synced switches), where tapping goes, and what an
// action does. Mounted by SessionRuntime, so every signed-in page has the bell's sheet.
import { useRouter } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useToast } from "@/components/overlays/toaster"
import { NotificationCenter } from "@/features/notifications/components/notification-center"
import { NotificationSettings } from "@/features/notifications/components/notification-settings"
import { usePrefs, useSetPrefs } from "@/hooks/use-prefs"
import { useSession } from "@/hooks/use-session"
import type { AppRuntime } from "./runtime"
import { useAppUpdate } from "./update-runtime"
import { usePushState } from "./use-push-state"

/** The notification switches, used by the sheet's settings view and /settings/notifications. */
export function NotificationSettingsPanel({ app }: { app: AppRuntime }) {
  const state = usePushState(app)
  const prefs = usePrefs()
  const setPrefs = useSetPrefs()
  const toast = useToast()
  const session = useSession(app.auth)
  return (
    <NotificationSettings
      state={state}
      prefs={prefs.notifications}
      guest={session?.role === "guest"}
      onEnable={() => void app.push.enable()}
      onDisable={() => void app.push.disable()}
      onTest={() =>
        void app.push
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
  )
}

export function NotificationCenterRuntime({
  app,
  children,
}: {
  app: AppRuntime
  children: ReactNode
}) {
  const router = useRouter()
  const update = useAppUpdate()
  return (
    <NotificationCenter
      settings={<NotificationSettingsPanel app={app} />}
      onNavigate={(href) => void router.navigate({ href })}
      // "update" is the only action so far (NotificationRow["action"])
      onAction={() => update.apply()}
    >
      {children}
    </NotificationCenter>
  )
}
