import { usePrePrompt } from "@/app/use-push-state"
import { PushPrePrompt } from "@/features/notifications/components/push-pre-prompt"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { TabRootActions } from "@/app/tab-root-actions"
import { ToolbarButton } from "@/components/controls/toolbar-button"
import { DataView } from "@/components/data-view/data-view"
import { Megaphone, SquarePen } from "@/components/icons/icon"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { useAnnouncements } from "@/features/messages/api/get-announcements"
import type { AnnouncementView } from "@/features/messages/api/get-announcements"
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

export const Route = createFileRoute("/_authed/_event/_tabs/messages/")({
  validateSearch: z.object({
    sheet: z.enum(["new-dm"]).optional().catch(undefined),
  }),
  component: Messages,
})

const PREVIEW = 2

// The Messages tab (FX-14): announcements on top, then the event chat and DMs. Guests read
// announcements only (ADR-066), so they see the first section and a note instead of the chat.
function Messages() {
  const { app, event, session } = Route.useRouteContext()
  const prompt = usePrePrompt(app())
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const go = useNavigate()
  const people = usePeople()
  const dm = useDmChannel()
  const announcements = useAnnouncements(event.key)
  const canChat = can(session, "message:read")
  const conversations = useConversations(event.key)
  return (
    <StackPage
      title="Messages"
      trailing={
        <>
          {can(session, "message:send") ? (
            <ToolbarButton
              label="New Message"
              onClick={() => void navigate({ search: { sheet: "new-dm" } })}
            >
              <SquarePen aria-hidden size={22} />
            </ToolbarButton>
          ) : null}
          <TabRootActions />
        </>
      }
    >
      <section aria-labelledby="announcements" className="mt-2">
        <h2
          id="announcements"
          className="mb-1.5 px-4 text-footnote text-muted-foreground uppercase"
        >
          Announcements
        </h2>
        <DataView state={announcements} size="inline">
          <DataView.Empty icon={Megaphone} title="No announcements yet" />
          <DataView.Error title="Couldn’t load announcements." />
          <DataView.Success>
            {(list: ReadonlyArray<AnnouncementView>) => (
              <List>
                {[
                  ...list.filter((a) => a.urgent),
                  ...list.filter((a) => !a.urgent),
                ]
                  .slice(0, PREVIEW)
                  .map((a) => (
                    <List.Row
                      key={a.id}
                      title={
                        <span className="line-clamp-2">
                          {a.urgent ? <strong>Urgent: </strong> : null}
                          {a.body}
                        </span>
                      }
                      href="/messages/announcements"
                    />
                  ))}
                {list.length > PREVIEW ? (
                  <List.Row
                    title="All Announcements"
                    detail={String(list.length)}
                    href="/messages/announcements"
                  />
                ) : null}
              </List>
            )}
          </DataView.Success>
        </DataView>
      </section>

      <section aria-labelledby="conversations" className="mt-6">
        <h2
          id="conversations"
          className="mb-1.5 px-4 text-footnote text-muted-foreground uppercase"
        >
          Conversations
        </h2>
        {canChat ? (
          <ConversationsView state={conversations} />
        ) : (
          <p className="px-4 text-subhead text-muted-foreground">
            Chat is for team members. Sign in with your account to message the
            team.
          </p>
        )}
      </section>

      {canChat ? (
        <PushPrePrompt
          open={prompt.open}
          reason="Get notified when someone messages you."
          onEnable={prompt.enable}
          onNotNow={prompt.notNow}
        />
      ) : null}
      <NewDmSheet
        open={search.sheet === "new-dm"}
        onOpenChange={(open) => {
          if (!open) void navigate({ search: {}, replace: true })
        }}
        people={people}
        onPick={(id) =>
          void go({
            to: "/messages/$channelId",
            params: { channelId: dm(id) },
            replace: true,
          })
        }
      />
    </StackPage>
  )
}
