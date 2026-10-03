import { Outlet, createFileRoute } from "@tanstack/react-router"
import { TabShell } from "@/components/layout/tab-shell"
import { useConversations } from "@/features/messages/api/get-messages"

export const Route = createFileRoute("/_authed/_event/_tabs")({
  component: TabsLayout,
})

function TabsLayout() {
  const { event } = Route.useRouteContext()
  const conversations = useConversations(event.key)
  const unread =
    conversations.status === "success"
      ? conversations.data.reduce((n, c) => n + c.unread, 0)
      : 0
  return (
    <TabShell badges={{ messages: unread }}>
      <Outlet />
    </TabShell>
  )
}
