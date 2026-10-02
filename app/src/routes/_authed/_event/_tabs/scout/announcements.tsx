import { usePrePrompt } from "@/app/use-push-state"
import { PushPrePrompt } from "@/features/notifications/components/push-pre-prompt"
import { createFileRoute } from "@tanstack/react-router"
import { useSyncExternalStore } from "react"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { useToast } from "@/components/overlays/toaster"
import {
  useAckedAnnouncements,
  useAnnouncements,
  useToggleReaction,
} from "@/features/messages/api/get-announcements"
import { AnnouncementsView } from "@/features/messages/components/announcements-view"
import { can } from "@/lib/authorization"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/scout/announcements"
)({
  component: Announcements,
})

function Announcements() {
  const { app, event, session } = Route.useRouteContext()
  const runtime = app()
  const prompt = usePrePrompt(runtime)
  const caps = useSyncExternalStore(
    runtime.capabilities.subscribe,
    runtime.capabilities.get,
    runtime.capabilities.get
  )
  const state = useAnnouncements(event.key)
  const { acked, acknowledge } = useAckedAnnouncements()
  const toggle = useToggleReaction(event.key)
  const toast = useToast()
  const canReact =
    caps.reactions &&
    can(session, "reaction:create", { targetType: "announcement" })

  return (
    <StackPage
      title="Announcements"
      leading={<NavBackButton parentHref="/scout" label="Scout" />}
    >
      <AnnouncementsView
        state={state}
        acked={acked}
        onAcknowledge={(id) => void acknowledge(id)}
        onReact={
          canReact
            ? (id, emoji, mineId) =>
                void toggle(id, emoji, mineId).catch(() =>
                  toast.show({
                    title: "Couldn’t save your reaction. Try again.",
                  })
                )
            : null
        }
      />
      <PushPrePrompt
        open={prompt.open}
        reason="Hear about announcements as soon as they’re sent."
        onEnable={prompt.enable}
        onNotNow={prompt.notNow}
      />
    </StackPage>
  )
}
