import { usePrePrompt } from "@/app/use-push-state"
import { PushPrePrompt } from "@/features/notifications/components/push-pre-prompt"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { ToolbarButton } from "@/components/controls/toolbar-button"
import { SquarePen } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import {
  useConversations,
  useDmChannel,
  usePeople,
} from "@/features/messages/api/get-messages"
import {
  ConversationsView,
  NewDmSheet,
} from "@/features/messages/components/chat-views"
import { can } from "@/lib/authorization"

export const Route = createFileRoute("/_authed/_event/_tabs/scout/messages/")({
  validateSearch: z.object({
    sheet: z.enum(["new-dm"]).optional().catch(undefined),
  }),
  component: Messages,
})

function Messages() {
  const { app, event, session } = Route.useRouteContext()
  const prompt = usePrePrompt(app())
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const go = useNavigate()
  const people = usePeople()
  const dm = useDmChannel()
  return (
    <StackPage
      title="Messages"
      leading={<NavBackButton parentHref="/scout" label="Scout" />}
      trailing={
        can(session, "message:send") ? (
          <ToolbarButton
            label="New Message"
            onClick={() => void navigate({ search: { sheet: "new-dm" } })}
          >
            <SquarePen aria-hidden size={22} />
          </ToolbarButton>
        ) : undefined
      }
    >
      <ConversationsView state={useConversations(event.key)} />
      <PushPrePrompt
        open={prompt.open}
        reason="Get notified when someone messages you."
        onEnable={prompt.enable}
        onNotNow={prompt.notNow}
      />
      <NewDmSheet
        open={search.sheet === "new-dm"}
        onOpenChange={(open) => {
          if (!open) void navigate({ search: {}, replace: true })
        }}
        people={people}
        onPick={(id) =>
          void go({
            to: "/scout/messages/$channelId",
            params: { channelId: dm(id) },
            replace: true,
          })
        }
      />
    </StackPage>
  )
}
