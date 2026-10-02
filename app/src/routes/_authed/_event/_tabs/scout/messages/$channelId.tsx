import { createFileRoute } from "@tanstack/react-router"
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

export const Route = createFileRoute(
  "/_authed/_event/_tabs/scout/messages/$channelId"
)({
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
  const peer = dmPeer(channelId, session.userId)
  const title = channelId.startsWith("event:")
    ? `#${event.key}`
    : (people.find((p) => p.id === peer)?.name ?? "Message")
  const newest =
    state.status === "success" ? (state.data.at(-1)?.createdAt ?? 0) : 0
  useEffect(() => {
    if (newest) void markRead(newest)
  }, [newest, markRead])
  return (
    <StackPage
      title={title}
      titleMode="inline"
      leading={<NavBackButton parentHref="/scout/messages" label="Messages" />}
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
