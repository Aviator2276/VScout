import { Outlet, createFileRoute } from "@tanstack/react-router"
import { TabShell } from "@/components/layout/tab-shell"

export const Route = createFileRoute("/_authed/_event/_tabs")({
  component: TabsLayout,
})

function TabsLayout() {
  return (
    <TabShell>
      <Outlet />
    </TabShell>
  )
}
