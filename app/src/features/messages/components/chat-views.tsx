// Messages (scout-tab.md D1, D2): the conversation list with the event channel pinned, and a thread
// with day separators, my messages trailing, pending (clock) and failed ("Not sent. Tap to retry.")
// states, reactions, and a composer above the keyboard. Bodies render through GlossaryText.
import { use, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Button } from "@/components/controls/button"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { SearchField } from "@/components/form/search-field"
import { GlossaryText } from "@/components/glossary/glossary-text"
import {
  Ellipsis,
  Lock,
  LoaderCircle,
  MessageSquare,
} from "@/components/icons/icon"
import { ListLinkContext } from "@/components/list/list"
import { useKeyboardInset } from "@/hooks/use-keyboard-inset"
import { useLongPress } from "@/hooks/use-long-press"
import { REACTION_EMOJI } from "@/lib/contracts/reaction"
import { haptic } from "@/lib/haptics"
import { Sheet } from "@/components/overlays/sheet"
import type { DataState } from "@/lib/db/react/data-state"
import { cn } from "@/lib/utils"
import type { Emoji } from "../api/get-announcements"
import type { ChatMessage, Conversation, Person } from "../api/get-messages"
import { ReactionBar } from "./reaction-bar"

const time = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
})
const day = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
})

export function ConversationsView({
  state,
}: {
  state: DataState<ReadonlyArray<Conversation>>
}) {
  const renderLink = use(ListLinkContext)
  const [q, setQ] = useState("")
  const needle = q.trim().toLowerCase()
  return (
    <div className="flex flex-col gap-2">
      <SearchField
        landmark="Conversations"
        label="Search messages"
        placeholder="Name or message"
        value={q}
        onValueChange={setQ}
      />
      <DataView state={state} size="page">
        <DataView.Loading label="Loading messages…">
          <SkeletonRows rows={4} rowClassName="h-16" />
        </DataView.Loading>
        <DataView.Error title="Couldn’t load messages." />
        <DataView.Success>
          {(list: ReadonlyArray<Conversation>) => {
            const shown = list.filter(
              (c) =>
                !needle ||
                c.title.toLowerCase().includes(needle) ||
                (c.lastText ?? "").toLowerCase().includes(needle)
            )
            return shown.length === 0 ? (
              <p
                role="status"
                className="py-8 text-center text-subhead text-muted-foreground"
              >
                No conversations match ‘{q.trim()}’
              </p>
            ) : (
              <>
                <ul aria-label="Conversations" className="flex flex-col gap-2">
                  {shown.map((c) => (
                    <li
                      key={c.channelId}
                      className="relative flex min-h-16 items-center gap-3 rounded-2xl bg-card px-4 py-2 shadow-xs active:bg-muted"
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        {renderLink({
                          href: `/messages/${c.channelId}`,
                          className:
                            "truncate text-body font-medium after:absolute after:inset-0",
                          children: c.title,
                        })}
                        <span className="truncate text-footnote text-muted-foreground">
                          {c.lastText ?? "No messages yet. Say hi."}
                        </span>
                      </div>
                      {c.unread > 0 ? (
                        <span className="min-w-6 rounded-full bg-primary px-2 text-center text-caption-1 font-semibold text-primary-foreground">
                          <span className="sr-only">Unread: </span>
                          {c.unread}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {list.length === 1 ? (
                  <p className="px-1 text-footnote text-muted-foreground">
                    No direct messages yet
                  </p>
                ) : null}
              </>
            )
          }}
        </DataView.Success>
      </DataView>
    </div>
  )
}

export function ThreadView({
  state,
  onSend,
  onRetry,
  onDelete,
  onReact,
}: {
  state: DataState<ReadonlyArray<ChatMessage>>
  onSend: (body: string) => Promise<unknown>
  onRetry: (id: string) => void
  onDelete: (id: string) => void
  onReact: (id: string, emoji: Emoji, mineId: string | null) => void
}) {
  const [acting, setActing] = useState<ChatMessage | null>(null)
  const keyboard = useKeyboardInset()
  const [composerHeight, setComposerHeight] = useState(96)
  return (
    <div
      className="flex flex-col gap-3"
      // the list ends above the composer (which grows and rides the keyboard)
      style={{ paddingBottom: composerHeight + keyboard + 16 }}
    >
      <DataView state={state} size="page">
        <DataView.Loading label="Loading messages…">
          <SkeletonRows rows={5} rowClassName="h-12" />
        </DataView.Loading>
        <DataView.Empty icon={MessageSquare} title="No messages yet. Say hi." />
        <DataView.Missing
          forbidden={{ icon: Lock, title: "This conversation isn’t available" }}
          not-synced={{
            title: "Messages not downloaded yet",
            description: "Connect to download them.",
          }}
        />
        <DataView.Error title="Couldn’t load messages." />
        <DataView.Success>
          {(msgs: ReadonlyArray<ChatMessage>) => (
            <ol aria-label="Messages" className="flex flex-col gap-2">
              {msgs.map((m, i) => {
                const prev = msgs[i - 1]
                const newDay =
                  !prev ||
                  day.format(prev.createdAt) !== day.format(m.createdAt)
                return (
                  <li key={m.id} className="flex flex-col">
                    {newDay ? (
                      <p className="py-2 text-center text-caption-1 text-muted-foreground">
                        {day.format(m.createdAt)}
                      </p>
                    ) : null}
                    <MessageBubble
                      message={m}
                      showAuthor={
                        !prev || newDay || prev.authorId !== m.authorId
                      }
                      onActions={() => setActing(m)}
                      onRetry={() => onRetry(m.id)}
                      onReact={(e, mine) => onReact(m.id, e, mine)}
                    />
                  </li>
                )
              })}
            </ol>
          )}
        </DataView.Success>
      </DataView>
      {state.status === "missing" ? null : (
        <Composer
          onSend={onSend}
          keyboard={keyboard}
          onHeight={setComposerHeight}
        />
      )}
      <MessageActionsSheet
        message={acting}
        onClose={() => setActing(null)}
        onReact={(e, mine) => acting && onReact(acting.id, e, mine)}
        onDelete={() => acting && onDelete(acting.id)}
      />
    </div>
  )
}

/** One message: long-press the bubble (or tap ⋯) for its actions (FX-21). */
function MessageBubble({
  message: m,
  showAuthor,
  onActions,
  onRetry,
  onReact,
}: {
  message: ChatMessage
  showAuthor: boolean
  onActions: () => void
  onRetry: () => void
  onReact: (emoji: Emoji, mineId: string | null) => void
}) {
  const { pressing, handlers } = useLongPress(() => {
    haptic("selection")
    onActions()
  })
  const failed = m.syncState === "rejected" || m.syncState === "conflict"
  return (
    <div
      className={cn(
        "flex max-w-[85%] flex-col gap-1",
        m.mine ? "items-end self-end" : "self-start"
      )}
    >
      {showAuthor ? (
        <span className="px-1 text-caption-1 text-muted-foreground">
          {m.authorName} · {time.format(m.createdAt)}
        </span>
      ) : null}
      <div
        className={cn(
          "flex items-center gap-1",
          m.mine ? "flex-row-reverse" : "flex-row"
        )}
      >
        <div
          {...handlers}
          // the system callout would compete with our long press
          onContextMenu={(e) => {
            e.preventDefault()
            onActions()
          }}
          className={cn(
            "rounded-2xl px-3 py-2 text-body break-words transition-[scale] duration-150 [-webkit-touch-callout:none]",
            pressing && "scale-[0.97]",
            m.mine ? "bg-primary text-primary-foreground" : "bg-card shadow-xs"
          )}
        >
          <GlossaryText>{m.body}</GlossaryText>
        </div>
        <button
          type="button"
          aria-label={`Message actions: ${m.body.slice(0, 40)}`}
          onClick={onActions}
          className="hit-44 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 active:bg-muted"
        >
          <Ellipsis aria-hidden size={16} />
        </button>
      </div>
      {m.syncState === "pending" ? (
        <span className="flex items-center gap-1 text-caption-1 text-muted-foreground">
          <LoaderCircle aria-hidden size={12} /> Sending…
        </span>
      ) : failed ? (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-9 text-caption-1 text-destructive"
        >
          Not sent. Tap to retry.
        </button>
      ) : null}
      {m.reactions.length > 0 ? (
        <ReactionBar
          reactions={m.reactions}
          onToggle={onReact}
          canAdd={false}
        />
      ) : null}
    </div>
  )
}

/** Reactions (who reacted, too), copy and delete for one message (FX-20, FX-21). */
function MessageActionsSheet({
  message,
  onClose,
  onReact,
  onDelete,
}: {
  message: ChatMessage | null
  onClose: () => void
  onReact: (emoji: Emoji, mineId: string | null) => void
  onDelete: () => void
}) {
  const mineFor = (e: Emoji) =>
    message?.reactions.find((r) => r.emoji === e)?.mineId ?? null
  return (
    <Sheet open={message !== null} onOpenChange={(o) => !o && onClose()}>
      {message ? (
        <Sheet.Content title="Message" description={message.authorName}>
          <div
            role="group"
            aria-label="React"
            className="flex justify-between gap-1 rounded-full bg-card p-1.5"
          >
            {REACTION_EMOJI.map((e) => {
              const mine = mineFor(e)
              return (
                <button
                  key={e}
                  type="button"
                  aria-label={`React with ${e}`}
                  aria-pressed={mine !== null}
                  onClick={() => {
                    haptic("selection")
                    onReact(e, mine)
                    onClose()
                  }}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full text-title-3 transition-[scale] active:scale-90",
                    mine !== null && "bg-primary/15"
                  )}
                >
                  {e}
                </button>
              )
            })}
          </div>
          {message.reactions.length > 0 ? (
            <section aria-label="Who reacted" className="mt-4">
              <h3 className="mb-1.5 px-4 text-footnote text-muted-foreground uppercase">
                Who reacted
              </h3>
              <ul className="flex flex-col divide-y divide-border rounded-2xl bg-card">
                {message.reactions.map((r) => (
                  <li
                    key={r.emoji}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <span aria-hidden className="text-title-3">
                      {r.emoji}
                    </span>
                    <span className="sr-only">{r.emoji}</span>
                    <span className="text-body">{r.names.join(", ")}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className="mt-4 flex flex-col overflow-hidden rounded-2xl bg-card">
            <button
              type="button"
              onClick={() => {
                // no clipboard on insecure origins (the LAN dev URL)
                if ("clipboard" in navigator)
                  void navigator.clipboard.writeText(message.body)
                onClose()
              }}
              className="min-h-11 px-4 text-start text-body active:bg-muted"
            >
              Copy Text
            </button>
            {message.mine ? (
              <button
                type="button"
                onClick={() => {
                  onDelete()
                  onClose()
                }}
                className="min-h-11 border-t border-border px-4 text-start text-body text-destructive active:bg-muted"
              >
                Delete Message
              </button>
            ) : null}
          </div>
        </Sheet.Content>
      ) : null}
    </Sheet>
  )
}

const COMPOSER_MAX_PX = 144

/**
 * The composer (FX-22): a text area that grows with new lines (up to about six, then it scrolls),
 * fixed above the tab bar or the home indicator, and lifted above the on-screen keyboard.
 */
function Composer({
  onSend,
  keyboard,
  onHeight,
}: {
  onSend: (body: string) => Promise<unknown>
  keyboard: number
  onHeight: (px: number) => void
}) {
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const form = useRef<HTMLFormElement>(null)

  // grow to fit the text, then scroll
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_PX)}px`
  }, [text])

  useEffect(() => {
    const el = form.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [onHeight])

  return (
    <form
      ref={form}
      className="fixed inset-x-0 bottom-(--tabbar-offset) z-20 flex items-end gap-2 glass pt-2 px-safe-4 pb-[calc(var(--tabbar-safe)+0.5rem)] transition-[bottom] duration-200"
      // with the keyboard up, sit right on top of it (the home indicator is under the keyboard)
      style={keyboard > 0 ? { bottom: keyboard, paddingBottom: 8 } : undefined}
      onSubmit={(e) => {
        e.preventDefault()
        const body = text.trim()
        if (!body) return
        setText("")
        onSend(body).catch(() => {
          setText(body)
          setError("Couldn’t save your message. Try again.")
        })
      }}
    >
      <label className="sr-only" htmlFor="composer">
        Message
      </label>
      <textarea
        ref={area}
        id="composer"
        rows={1}
        value={text}
        maxLength={4000}
        enterKeyHint="enter"
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        placeholder="Message"
        className="min-h-11 flex-1 resize-none overflow-y-auto rounded-2xl bg-muted px-3 py-2.5 text-body outline-none"
      />
      <Button type="submit" disabled={!text.trim()}>
        Send
      </Button>
      {error ? (
        <p role="alert" className="sr-only">
          {error}
        </p>
      ) : null}
    </form>
  )
}

export function NewDmSheet({
  open,
  onOpenChange,
  people,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  people: ReadonlyArray<Person>
  onPick: (id: string) => void
}) {
  const [q, setQ] = useState("")
  const needle = q.trim().toLowerCase()
  const list = people.filter(
    (p) => !needle || p.name.toLowerCase().includes(needle)
  )
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <Sheet.Content title="New Message" detent="large">
        <SearchField
          landmark="People"
          label="Find a person"
          placeholder="Name"
          value={q}
          onValueChange={setQ}
        />
        {list.length === 0 ? (
          <p
            role="status"
            className="py-6 text-center text-subhead text-muted-foreground"
          >
            {people.length === 0
              ? "No one to message yet"
              : `No one matches ‘${q.trim()}’`}
          </p>
        ) : (
          <ul aria-label="People" className="flex flex-col">
            {list.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p.id)}
                  className="flex min-h-12 w-full items-center border-b border-border/60 px-1 text-left text-body"
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet.Content>
    </Sheet>
  )
}
