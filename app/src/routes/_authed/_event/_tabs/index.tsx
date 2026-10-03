import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"
import { z } from "zod"
import { renderHomeWidget } from "@/app/home-widgets"
import { TabRootActions, TabRootLeading } from "@/app/tab-root-actions"
import { StackPage } from "@/components/layout/stack-page"
import { HomeView } from "@/features/home-widgets/components/home-view"
import { uuidIds } from "@/lib/ids"

export const Route = createFileRoute("/_authed/_event/_tabs/")({
  validateSearch: z.object({
    edit: z.boolean().optional().catch(undefined),
    sheet: z
      .enum(["add-widget", "edit-widget", "layout"])
      .optional()
      .catch(undefined),
    id: z.string().max(64).optional().catch(undefined),
  }),
  component: Home,
})

function Home() {
  const { event, session } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const render = useMemo(() => renderHomeWidget(event.key), [event.key])
  return (
    <StackPage
      leading={<TabRootLeading />}
      title="Home"
      trailing={search.edit ? undefined : <TabRootActions profile />}
    >
      <p className="mb-3 text-footnote text-muted-foreground">{event.name}</p>
      <HomeView
        role={session.role}
        editing={search.edit === true}
        onEditingChange={(edit, then) =>
          void navigate({
            search: (p) => ({ ...p, ...then, edit: edit || undefined }),
            replace: true,
          })
        }
        sheet={search.sheet}
        sheetId={search.id}
        onSheet={(sheet, id) =>
          void navigate({
            search: (p) => ({ ...p, sheet, id }),
            replace: sheet === undefined,
          })
        }
        renderWidget={render}
        newId={uuidIds.newId}
      />
    </StackPage>
  )
}
