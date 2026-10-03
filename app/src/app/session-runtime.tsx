// Mounted by _authed (routing-auth §7.2): starts refresh → sync → MQTT while signed in, provides the
// data runtime to feature hooks, and reacts to the session ending or the role changing.
import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"
import type { ReactNode } from "react"
import { ShellBannersContext } from "@/components/layout/shell-banners"
import { useToast } from "@/components/overlays/toaster"
import { DataRuntimeContext } from "@/lib/db/react/data-runtime"
import { getTabMemory } from "@/stores/tab-memory"
import type { AppRuntime } from "./runtime"
import { SessionHelpSettings } from "./help-runtime"
import { NotificationCenterRuntime } from "./notification-center-runtime"
import { SessionBanners } from "./session-banners"
import { useAppearance } from "./use-appearance"
import { usePushMessages } from "./use-push-messages"

const ROLE_LABEL = { admin: "Admin", scouter: "Scouter", guest: "Guest" }

export function SessionRuntime({
  app,
  children,
}: {
  app: AppRuntime
  children: ReactNode
}) {
  const router = useRouter()
  const toast = useToast()

  useEffect(() => app.acquireSession(), [app])
  usePushMessages(app)

  useEffect(
    () =>
      app.onSessionEnded(async (reason) => {
        getTabMemory().reset()
        // resolves once /login has rendered, so nothing signed-in still reads Dexie
        await router.navigate({
          to: "/login",
          search: { reason },
          replace: true,
        })
        await router.invalidate()
      }),
    [app, router]
  )

  useEffect(
    () =>
      app.onRoleChanged((role) => {
        toast.show({ title: `Your role changed to ${ROLE_LABEL[role]}` })
        void router.invalidate()
      }),
    [app, router, toast]
  )

  return (
    <DataRuntimeContext value={app.dataRuntime}>
      <SessionEffects />
      <ShellBannersContext value={<SessionBanners />}>
        <NotificationCenterRuntime app={app}>
          {children}
        </NotificationCenterRuntime>
      </ShellBannersContext>
    </DataRuntimeContext>
  )
}

/** Effects that read Dexie: they live inside the data runtime. */
function SessionEffects() {
  useAppearance()
  return <SessionHelpSettings />
}
