// The announcement feed (scout-tab.md D3): urgent ones this device hasn't acknowledged are pinned
// on top with a Got It button; everything else is newest first. Every role reacts here, guests
// included (ADR-073). Bodies render through GlossaryText.
import { Megaphone, Pin } from "@/components/icons/icon"
import { Button } from "@/components/controls/button"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { GlossaryText } from "@/components/glossary/glossary-text"
import { SyncBadge } from "@/components/sync/sync-badge"
import type { DataState } from "@/lib/db/react/data-state"
import { cn } from "@/lib/utils"
import type { AnnouncementView, Emoji } from "../api/get-announcements"
import { ReactionBar } from "./reaction-bar"

const when = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
})

export interface AnnouncementsViewProps {
  state: DataState<ReadonlyArray<AnnouncementView>>
  acked: ReadonlySet<string>
  onAcknowledge: (id: string) => void
  /** null hides the reaction bar (no `reactions` capability) */
  onReact: ((id: string, emoji: Emoji, mineId: string | null) => void) | null
}

function Card({
  a,
  pinned,
  onAcknowledge,
  onReact,
}: {
  a: AnnouncementView
  pinned: boolean
  onAcknowledge: (id: string) => void
  onReact: AnnouncementsViewProps["onReact"]
}) {
  return (
    <article
      aria-label={`${a.urgent ? "Urgent announcement" : "Announcement"} from ${a.authorName}`}
      className={cn(
        "flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-xs",
        pinned && "border border-destructive/40"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-muted-foreground">
        {pinned ? (
          <span className="inline-flex items-center gap-1 font-semibold text-destructive">
            <Pin aria-hidden size={12} /> Urgent
          </span>
        ) : a.urgent ? (
          <span className="font-semibold">Urgent</span>
        ) : null}
        <span className="font-semibold text-foreground">{a.authorName}</span>
        <time dateTime={new Date(a.createdAt).toISOString()}>
          {when.format(a.createdAt)}
        </time>
        <SyncBadge state={a.syncState} />
      </div>
      <p className="text-body break-words">
        <GlossaryText>{a.body}</GlossaryText>
      </p>
      {onReact ? (
        <ReactionBar
          reactions={a.reactions}
          onToggle={(emoji, mineId) => onReact(a.id, emoji, mineId)}
        />
      ) : null}
      {pinned ? (
        <Button variant="secondary" onClick={() => onAcknowledge(a.id)}>
          Got It
        </Button>
      ) : null}
    </article>
  )
}

export function AnnouncementsView({
  state,
  acked,
  onAcknowledge,
  onReact,
}: AnnouncementsViewProps) {
  return (
    <DataView state={state} size="page">
      <DataView.Loading label="Loading announcements…">
        <SkeletonRows rows={3} rowClassName="h-24" />
      </DataView.Loading>
      <DataView.Empty
        icon={Megaphone}
        title="No announcements yet"
        description="Announcements from your admins show up here."
      />
      <DataView.Missing
        not-synced={{
          title: "Announcements not downloaded yet",
          description: "Connect to download them.",
        }}
      />
      <DataView.Error title="Couldn’t load announcements." />
      <DataView.Success>
        {(list: ReadonlyArray<AnnouncementView>) => {
          const pinned = list.filter((a) => a.urgent && !acked.has(a.id))
          const rest = list.filter((a) => !pinned.includes(a))
          return (
            <div className="flex flex-col gap-3">
              {pinned.map((a) => (
                <Card
                  key={a.id}
                  a={a}
                  pinned
                  onAcknowledge={onAcknowledge}
                  onReact={onReact}
                />
              ))}
              {rest.map((a) => (
                <Card
                  key={a.id}
                  a={a}
                  pinned={false}
                  onAcknowledge={onAcknowledge}
                  onReact={onReact}
                />
              ))}
            </div>
          )
        }}
      </DataView.Success>
    </DataView>
  )
}
