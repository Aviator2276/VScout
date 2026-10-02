// Home widgets owned by messages (features/home.md H5): Announcements and Recent Messages.
import { DataView } from "@/components/data-view/data-view"
import { GlossaryText } from "@/components/glossary/glossary-text"
import { WidgetCard } from "@/components/grid/widget-card"
import { Megaphone, MessageSquare } from "@/components/icons/icon"
import type { WidgetProps } from "@/types/widget"
import { useAnnouncements } from "../api/get-announcements"
import type { AnnouncementView } from "../api/get-announcements"
import { eventChannel, useThread } from "../api/get-messages"
import type { ChatMessage } from "../api/get-messages"

export function AnnouncementsWidget({ eventKey, h }: WidgetProps) {
  const state = useAnnouncements(eventKey)
  return (
    <WidgetCard title="Announcements" href="/scout/announcements">
      <DataView state={state} size="inline">
        <DataView.Empty icon={Megaphone} title="No announcements yet" />
        <DataView.Error title="Couldn’t load announcements." />
        <DataView.Success>
          {(list: ReadonlyArray<AnnouncementView>) => {
            const ordered = [
              ...list.filter((a) => a.urgent),
              ...list.filter((a) => !a.urgent),
            ]
            return (
              <ul className="flex flex-col gap-2 text-subhead">
                {ordered.slice(0, Math.max(1, h - 1)).map((a) => (
                  <li key={a.id} className="line-clamp-2">
                    {a.urgent ? <strong>Urgent: </strong> : null}
                    <GlossaryText>{a.body}</GlossaryText>
                    {a.reactions.length ? (
                      <span className="ms-1 text-footnote text-muted-foreground">
                        {a.reactions
                          .map((r) => `${r.emoji}${r.count}`)
                          .join(" ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )
          }}
        </DataView.Success>
      </DataView>
    </WidgetCard>
  )
}

export function RecentMessagesWidget({ eventKey, h, config }: WidgetProps) {
  const channel =
    typeof config?.channel === "string"
      ? config.channel
      : eventChannel(eventKey)
  const state = useThread(channel)
  const latest: typeof state =
    state.status === "success"
      ? state.data.length
        ? {
            ...state,
            data: state.data.slice(-Math.max(1, Math.floor(h * 1.5))).reverse(),
          }
        : { status: "empty" }
      : state
  return (
    <WidgetCard title="Recent Messages" href={`/scout/messages/${channel}`}>
      <DataView state={latest} size="inline">
        <DataView.Empty icon={MessageSquare} title="No messages yet. Say hi." />
        <DataView.Missing
          forbidden={{ title: "This conversation isn’t available" }}
        />
        <DataView.Error title="Couldn’t load messages." />
        <DataView.Success>
          {(list: ReadonlyArray<ChatMessage>) => (
            <ul className="flex flex-col gap-1 text-subhead">
              {list.map((m) => (
                <li key={m.id} className="truncate">
                  <span className="font-semibold">{m.authorName}: </span>
                  {m.body}
                </li>
              ))}
            </ul>
          )}
        </DataView.Success>
      </DataView>
    </WidgetCard>
  )
}
