// Notes with their authors (ADR-040): newest first, author and time on each, a lock and "Only you"
// on private notes, and the record's sync state. Bodies go through GlossaryText.
import type { ReactNode } from "react"
import { GlossaryText } from "@/components/glossary/glossary-text"
import { Lock } from "@/components/icons/icon"
import { SyncBadge } from "@/components/sync/sync-badge"
import type { SyncState } from "@/lib/db/types"

export interface NoteItem {
  id: string
  body: string
  authorName: string
  createdAt: number
  private: boolean
  syncState: SyncState
  /** "Q12" when the note is about a match */
  context?: string | undefined
  /** mine: the author's own (Delete is offered) */
  mine?: boolean
}

const when = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
})

export function NoteList({
  notes,
  actions,
}: {
  notes: ReadonlyArray<NoteItem>
  /** per-note trailing actions (Delete for the author) */
  actions?: (note: NoteItem) => ReactNode
}) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Notes">
      {notes.map((n) => (
        <li key={n.id} className="rounded-2xl bg-card p-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-muted-foreground">
            <span className="font-semibold text-foreground">
              {n.authorName}
            </span>
            <time dateTime={new Date(n.createdAt).toISOString()}>
              {when.format(n.createdAt)}
            </time>
            {n.context ? <span>· {n.context}</span> : null}
            {n.private ? (
              <span className="inline-flex items-center gap-1">
                <Lock aria-hidden size={12} />
                Only you
              </span>
            ) : null}
            <SyncBadge state={n.syncState} />
            {actions ? <span className="ms-auto">{actions(n)}</span> : null}
          </div>
          <p className="mt-1 text-body break-words whitespace-normal">
            <GlossaryText>{n.body}</GlossaryText>
          </p>
        </li>
      ))}
    </ul>
  )
}
