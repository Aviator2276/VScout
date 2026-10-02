import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "@/components/controls/button"
import { DataView } from "@/components/data-view/data-view"
import { TextField } from "@/components/form/text-field"
import { MessageSquare, Trash2 } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { Sheet } from "@/components/overlays/sheet"
import { useToast } from "@/components/overlays/toaster"
import { formatAgo } from "@/components/sync/sync-badge"
import {
  useAudit,
  useModerateComment,
  useTeamComments,
  useUserNames,
} from "@/features/admin/api/get-admin"
import type { AuditRow } from "@/features/admin/api/get-admin"
import { useNow } from "@/hooks/use-now"
import { useOnline } from "@/hooks/use-online"
import type { CommentRecord } from "@/lib/db/types"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/admin/moderation"
)({
  component: Moderation,
})

const ACTION = {
  delete: "Deleted",
  update: "Edited",
  restore: "Restored",
  role: "Changed role",
} as Record<string, string>

// AD5: remove inappropriate team notes with a reason, and the moderation history. Never others'
// private notes (ADR-040).
function Moderation() {
  const { event, session } = Route.useRouteContext()
  const online = useOnline()
  const comments = useTeamComments(event.key)
  const audit = useAudit(event.key, online)
  const names = useUserNames()
  const moderate = useModerateComment()
  const toast = useToast()
  const now = useNow()
  const [target, setTarget] = useState<CommentRecord | null>(null)
  const [reason, setReason] = useState("")
  const others =
    comments.status === "success"
      ? (() => {
          const data = comments.data.filter(
            (c) => c.authorId !== session.userId
          )
          return data.length === 0
            ? ({ status: "empty" } as const)
            : { ...comments, data }
        })()
      : comments
  const shownAudit =
    audit.status === "success" && audit.data.length === 0
      ? ({ status: "empty" } as const)
      : audit
  return (
    <StackPage
      title="Moderation"
      leading={<NavBackButton parentHref="/settings/admin" label="Admin" />}
    >
      <h2 className="mt-4 px-4 text-footnote text-muted-foreground uppercase">
        Team notes
      </h2>
      <DataView state={others} size="section">
        <DataView.Empty icon={MessageSquare} title="No notes from others yet" />
        <DataView.Error title="Couldn’t load notes." />
        <DataView.Success>
          {(list: ReadonlyArray<CommentRecord>) => (
            <ul className="mt-2 flex flex-col gap-2" aria-label="Team notes">
              {list.map((c) => (
                <li key={c.id} className="flex gap-2 rounded-2xl bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-body whitespace-pre-wrap">{c.body}</p>
                    <p className="mt-1 text-footnote text-muted-foreground">
                      {[
                        names.get(c.authorId) ?? "Unknown",
                        c.teamNumber ? `Team ${c.teamNumber}` : null,
                        formatAgo(now - c.createdAt),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete note by ${names.get(c.authorId) ?? "Unknown"}`}
                    onClick={() => setTarget(c)}
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
      <h2 className="mt-6 px-4 text-footnote text-muted-foreground uppercase">
        History
      </h2>
      <DataView state={shownAudit} size="section">
        <DataView.Empty title="No moderation actions yet" />
        <DataView.Error title="Couldn’t load the history." />
        <DataView.Success>
          {(rows: ReadonlyArray<AuditRow>) => (
            <List.Section>
              {rows.map((a) => (
                <List.Row
                  key={a.id}
                  title={`${ACTION[a.action] ?? a.action} ${a.entity === "comment" ? "a note" : a.entity}`}
                  subtitle={[
                    names.get(a.actorId) ?? "Admin",
                    a.reason ? `“${a.reason}”` : null,
                    formatAgo(now - a.at),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
            </List.Section>
          )}
        </DataView.Success>
      </DataView>
      <Sheet
        open={target !== null}
        onOpenChange={(o) => (o ? undefined : setTarget(null))}
      >
        <Sheet.Content title="Delete Note">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!target || !reason.trim()) return
              void moderate(target.id, reason.trim()).then(() => {
                toast.show({ title: "Note deleted" })
                setTarget(null)
                setReason("")
              })
            }}
          >
            <p className="text-body">
              It’s removed for everyone. Admins see your reason in the history.
            </p>
            <TextField
              label="Reason"
              value={reason}
              onValueChange={setReason}
              maxLength={200}
            />
            <Button
              type="submit"
              variant="destructive"
              size="large"
              disabled={!reason.trim()}
            >
              Delete Note
            </Button>
          </form>
        </Sheet.Content>
      </Sheet>
    </StackPage>
  )
}
