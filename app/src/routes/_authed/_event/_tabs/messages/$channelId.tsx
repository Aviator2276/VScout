import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/lib/authorization"
import { useEffect } from "react"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { useToast } from "@/components/overlays/toaster"
import {
  dmPeer,
  useChatWrites,
  useMarkRead,
  usePeople,
  useThread,
} from "@/features/messages/api/get-messages"
import { ThreadView } from "@/features/messages/components/chat-views"
import { useNotificationActions } from "@/features/notifications/api/get-notifications"
import { useHideTabBar } from "@/hooks/use-tab-bar"

// Chat and DMs: never for guests (ADR-066). Rendered as "You don't have access" (routing-auth §5.3).
export const Route = createFileRoute(
  "/_authed/_event/_tabs/messages/$channelId"
)({
  beforeLoad: ({ context }) => {
    requirePermission(context.session, "message:read")
  },
  component: Thread,
})

function Thread() {
  const { channelId } = Route.useParams()
  const { event, session } = Route.useRouteContext()
  const toast = useToast()
  const state = useThread(channelId)
  const writes = useChatWrites(event.key, channelId)
  const markRead = useMarkRead(channelId)
  const people = usePeople()
  // a thread is immersive: the composer takes the tab bar's place (FX-11)
  useHideTabBar()
  const peer = dmPeer(channelId, session.userId)
  const title = channelId.startsWith("event:")
    ? `#${event.key}`
    : (people.find((p) => p.id === peer)?.name ?? "Message")
  const newest =
    state.status === "success" ? (state.data.at(-1)?.createdAt ?? 0) : 0
  useEffect(() => {
    if (newest) void markRead(newest)
  }, [newest, markRead])
  // reading the thread reads its in-app notifications (notifications-center.md criterion 14)
  const { markGroupRead } = useNotificationActions()
  useEffect(() => {
    void markGroupRead(channelId)
  }, [channelId, newest, markGroupRead])
  return (
    <StackPage
      title={title}
      titleMode="inline"
      leading={<NavBackButton parentHref="/messages" label="Messages" />}
    >
      <ThreadView
        state={state}
        onSend={(body) => writes.send(body)}
        onRetry={(id) => void writes.retry(id)}
        onDelete={(id) =>
          void writes
            .remove(id)
            .then(() => toast.show({ title: "Message deleted" }))
        }
        onReact={(id, emoji, mine) => void writes.react(id, emoji, mine)}
      />
    </StackPage>
  )
}
