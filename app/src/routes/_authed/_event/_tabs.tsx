import { Outlet, createFileRoute } from "@tanstack/react-router"
import { TabShell } from "@/components/layout/tab-shell"
import { useConversations } from "@/features/messages/api/get-messages"
import { useUnreadCount } from "@/features/notifications/api/get-notifications"
import { ANNOUNCEMENTS_GROUP } from "@/features/notifications/utils/sources"

export const Route = createFileRoute("/_authed/_event/_tabs")({
  component: TabsLayout,
})

function TabsLayout() {
  const { event } = Route.useRouteContext()
  const conversations = useConversations(event.key)
  // unread chats plus announcements not seen yet (owner: announcements showed no badge)
  const announcements = useUnreadCount("messages", ANNOUNCEMENTS_GROUP)
  const unread =
    (conversations.status === "success"
      ? conversations.data.reduce((n, c) => n + c.unread, 0)
      : 0) + announcements
  return (
    <TabShell badges={{ messages: unread }}>
      <Outlet />
    </TabShell>
  )
}
