import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { usePrePrompt } from "@/app/use-push-state"
import { Button } from "@/components/controls/button"
import { Switch } from "@/components/controls/switch"
import { DataView } from "@/components/data-view/data-view"
import { TextArea } from "@/components/form/text-field"
import { Megaphone, Trash2 } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { ConfirmAlert } from "@/components/overlays/confirm-alert"
import { useToast } from "@/components/overlays/toaster"
import { formatAgo } from "@/components/sync/sync-badge"
import {
  useAnnouncementWrites,
  useAnnouncements,
} from "@/features/messages/api/get-announcements"
import type { AnnouncementView } from "@/features/messages/api/get-announcements"
import { PushPrePrompt } from "@/features/notifications/components/push-pre-prompt"
import { useNow } from "@/hooks/use-now"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/admin/announcements"
)({
  component: AdminAnnouncements,
})

// AD8: post (optionally urgent), see reactions, delete. Saved through the outbox like any message.
function AdminAnnouncements() {
  const { event, app } = Route.useRouteContext()
  const runtime = app()
  const prompt = usePrePrompt(runtime)
  const state = useAnnouncements(event.key)
  const { post, remove } = useAnnouncementWrites(event.key)
  const toast = useToast()
  const now = useNow()
  const [body, setBody] = useState("")
  const [urgent, setUrgent] = useState(false)
  const [deleting, setDeleting] = useState<AnnouncementView | null>(null)
  return (
    <StackPage
      title="Announcements"
      leading={<NavBackButton parentHref="/settings/admin" label="Admin" />}
    >
      <form
        className="mt-2 flex flex-col gap-2 rounded-2xl bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!body.trim()) return
          void post(body, urgent)
            .then(() => {
              setBody("")
              setUrgent(false)
              toast.show({
                title: urgent
                  ? "Urgent announcement posted"
                  : "Announcement posted",
              })
            })
            .catch(() => toast.show({ title: "Couldn’t post. Try again." }))
        }}
      >
        <TextArea
          label="New announcement"
          value={body}
          onValueChange={setBody}
          rows={3}
          maxLength={4000}
        />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-subhead">
            <Switch
              label="Urgent"
              checked={urgent}
              onCheckedChange={setUrgent}
            />
            <span aria-hidden>Urgent</span>
          </div>
          <Button type="submit" className="ms-auto" disabled={!body.trim()}>
            Post
          </Button>
        </div>
        {urgent ? (
          <p className="text-footnote text-muted-foreground">
            Urgent announcements ask everyone to acknowledge them.
          </p>
        ) : null}
      </form>
      <DataView state={state} size="page">
        <DataView.Empty icon={Megaphone} title="No announcements yet" />
        <DataView.Error title="Couldn’t load announcements." />
        <DataView.Success>
          {(list: ReadonlyArray<AnnouncementView>) => (
            <ul className="mt-4 flex flex-col gap-2" aria-label="Announcements">
              {list.map((a) => (
                <li key={a.id} className="flex gap-2 rounded-2xl bg-card p-3">
                  <div className="min-w-0 flex-1">
                    {a.urgent ? (
                      <p className="text-caption-1 font-semibold text-destructive uppercase">
                        Urgent
                      </p>
                    ) : null}
                    <p className="text-body whitespace-pre-wrap">{a.body}</p>
                    <p className="mt-1 text-footnote text-muted-foreground">
                      {[
                        a.authorName,
                        formatAgo(now - a.createdAt),
                        a.syncState === "pending" ? "Sending…" : null,
                        a.reactions.length > 0
                          ? a.reactions
                              .map((r) => `${r.emoji} ${r.count}`)
                              .join("  ")
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete announcement"
                    onClick={() => setDeleting(a)}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-destructive"
                  >
                    <Trash2 aria-hidden size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DataView.Success>
      </DataView>
      <ConfirmAlert
        open={deleting !== null}
        onOpenChange={(o) => (o ? undefined : setDeleting(null))}
        title="Delete Announcement?"
        description="It’s removed for everyone."
        confirmLabel="Delete"
        tone="destructive"
        onConfirm={() => {
          if (deleting) void remove(deleting.id)
          setDeleting(null)
        }}
      />
      <PushPrePrompt
        open={prompt.open}
        reason="Turn on notifications on this device to check that announcements arrive."
        onEnable={prompt.enable}
        onNotNow={prompt.notNow}
      />
    </StackPage>
  )
}
