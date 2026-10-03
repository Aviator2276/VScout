// The notification center (features/notifications-center.md N0, N3): the bell with its unread
// badge, and the sheet with a category filter, row menus, select mode with bulk actions, and the
// settings view. The app layer provides what the sheet can't know: the settings content, how to
// navigate, and what an action does (applying an update).
import { createContext, use, useEffect, useState } from "react"
import type { ReactNode } from "react"
import { Button } from "@/components/controls/button"
import { Segmented } from "@/components/controls/segmented"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import {
  Bell,
  CalendarDays,
  CheckCheck,
  Trash2,
  ChevronLeft,
  Ellipsis,
  MessageCircle,
  Settings,
  Smartphone,
} from "@/components/icons/icon"
import type { LucideIcon } from "@/components/icons/icon"
import { ConfirmAlert } from "@/components/overlays/confirm-alert"
import { ActionMenu } from "@/components/overlays/menu"
import { Sheet } from "@/components/overlays/sheet"
import { SwipeRow } from "@/components/list/swipe-row"
import type { NotificationRow } from "@/lib/db/types"
import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { springs } from "@/components/motion/springs"
import { cn } from "@/lib/utils"
import { onNotified } from "../api/notifications-store"
import {
  useNotificationActions,
  useNotificationSummary,
  useNotifications,
} from "../api/get-notifications"
import type { NotificationCategory } from "../api/get-notifications"

export type CenterView = "list" | "settings"

interface CenterContext {
  open: (view?: CenterView) => void
}

const Ctx = createContext<CenterContext | null>(null)

/** Opens the center from anywhere under the provider (Settings → Notifications opens "settings"). */
export function useNotificationCenter(): CenterContext | null {
  return use(Ctx)
}

const FILTERS: ReadonlyArray<{
  value: NotificationCategory | "all"
  label: string
}> = [
  { value: "all", label: "All" },
  { value: "messages", label: "Messages" },
  { value: "events", label: "Matches" },
  { value: "system", label: "System" },
]

const ICON: Record<NotificationCategory, LucideIcon> = {
  messages: MessageCircle,
  events: CalendarDays,
  system: Smartphone,
}

const CATEGORY_NAME: Record<NotificationCategory, string> = {
  messages: "Messages",
  events: "Matches & Events",
  system: "System",
}

const ago = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

function relative(at: number, now: number): string {
  const min = Math.round((at - now) / 60_000)
  if (Math.abs(min) < 60) return ago.format(min, "minute")
  const hours = Math.round(min / 60)
  if (Math.abs(hours) < 24) return ago.format(hours, "hour")
  return ago.format(Math.round(hours / 24), "day")
}

export function NotificationCenter({
  children,
  settings,
  onNavigate,
  onAction,
}: {
  children: ReactNode
  /** the notification switches, rendered in the settings view */
  settings: ReactNode
  onNavigate: (href: string) => void
  onAction: (action: NonNullable<NotificationRow["action"]>) => void
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<CenterView>("list")
  const [openedAt, setOpenedAt] = useState(0)
  const actions = useNotificationActions()
  const markRead = (id: string) => actions.markRead([id])
  const ctx: CenterContext = {
    open: (next = "list") => {
      setView(next)
      setOpenedAt(Date.now())
      setOpen(true)
    },
  }
  return (
    <Ctx value={ctx}>
      {children}
      <NotificationBanner
        suppressed={open}
        onOpen={(row) => {
          void markRead(row.id)
          if (row.action) onAction(row.action)
          else if (row.href) onNavigate(row.href)
        }}
      />
      <Sheet open={open} onOpenChange={setOpen}>
        <Sheet.Content
          title={
            view === "settings" ? "Notification Settings" : "Notifications"
          }
          detent="large"
          closeLabel="Done"
        >
          {view === "settings" ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setView("list")}
                className="-ml-1 inline-flex min-h-11 items-center gap-0.5 self-start text-body text-primary active:opacity-60"
              >
                <ChevronLeft aria-hidden size={22} />
                Notifications
              </button>
              {settings}
            </div>
          ) : (
            <NotificationList
              now={openedAt}
              onSettings={() => setView("settings")}
              onOpen={(row) => {
                setOpen(false)
                if (row.action) onAction(row.action)
                else if (row.href) onNavigate(row.href)
              }}
            />
          )}
        </Sheet.Content>
      </Sheet>
    </Ctx>
  )
}

const BANNER_MS = 4500

/**
 * A notification that arrives while the app is open slides in at the top for a few seconds, like
 * an iOS banner (owner). Tap opens it; swipe it up to dismiss. Not for low priority, not while the
 * center is open, and not for the page you're already on (an open thread).
 */
function NotificationBanner({
  suppressed,
  onOpen,
}: {
  suppressed: boolean
  onOpen: (row: NotificationRow) => void
}) {
  const [row, setRow] = useState<NotificationRow | null>(null)
  useEffect(
    () =>
      onNotified((r) => {
        if (r.priority === "low") return
        if (r.href && location.pathname === r.href.split("?")[0]) return
        setRow(r)
      }),
    []
  )
  useEffect(() => {
    if (!row) return
    const t = setTimeout(() => setRow(null), BANNER_MS)
    return () => clearTimeout(t)
  }, [row])
  const shown = row && !suppressed ? row : null
  const Icon = shown ? ICON[shown.category] : Bell
  // Reduce Motion: the banner just appears (no slide, and no half-faded text)
  const reduce = useReducedMotion() === true
  return (
    <AnimatePresence>
      {shown ? (
        <m.div
          key={shown.id}
          role="status"
          initial={reduce ? false : { y: -120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: -120, opacity: 0 }}
          transition={springs.smooth}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.6, bottom: 0.1 }}
          onDragEnd={(_, info) => {
            if (info.offset.y < -30) setRow(null)
          }}
          className="fixed inset-x-0 top-[calc(var(--k-safe-area-top,0px)+0.5rem)] z-[65] mx-auto w-[min(100%-1.5rem,28rem)]"
        >
          <button
            type="button"
            onClick={() => {
              setRow(null)
              onOpen(shown)
            }}
            className="flex w-full items-center gap-3 rounded-3xl glass bg-(--glass-tint-sheet) px-4 py-3 text-start shadow-xl transition-[scale] active:scale-[0.98]"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
              <Icon aria-hidden size={20} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-subhead font-semibold">
                {shown.title}
              </span>
              {shown.body ? (
                <span className="line-clamp-2 text-footnote text-muted-foreground">
                  {shown.body}
                </span>
              ) : null}
            </span>
          </button>
        </m.div>
      ) : null}
    </AnimatePresence>
  )
}

/** The bell: replaces the sync pill in the nav bar (FX-15). */
export function NotificationBell() {
  const center = useNotificationCenter()
  const { unread, urgent } = useNotificationSummary()
  if (!center) return null
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => center.open()}
      className="hit-44 relative inline-flex size-9 items-center justify-center rounded-full glass-button text-primary transition-[scale] active:scale-90"
    >
      <Bell aria-hidden size={24} />
      {unread > 0 ? (
        <span
          aria-hidden
          className={cn(
            "absolute top-1 right-0.5 flex min-w-4.5 items-center justify-center rounded-full px-1 text-caption-2 leading-4.5 font-semibold tabular-nums",
            urgent
              ? "bg-destructive text-white"
              : "bg-primary text-primary-foreground"
          )}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </button>
  )
}

function NotificationList({
  now,
  onOpen,
  onSettings,
}: {
  now: number
  onOpen: (row: NotificationRow) => void
  onSettings: () => void
}) {
  const [filter, setFilter] = useState<NotificationCategory | "all">("all")
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [confirmClear, setConfirmClear] = useState(false)
  const state = useNotifications(filter)
  const actions = useNotificationActions()
  const rows = state.status === "success" ? state.data : []
  const ids = rows.map((r) => r.id)
  const chosen = [...selected].filter((id) => ids.includes(id))
  const anyUnread = rows.some((r) => r.readAt === undefined)

  const endSelect = () => {
    setSelecting(false)
    setSelected(new Set())
  }
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Show"
        value={filter}
        onValueChange={(v) => {
          setFilter(v)
          endSelect()
        }}
        options={FILTERS}
      />
      <div className="flex min-h-11 items-center gap-1">
        {selecting ? (
          <>
            <Button
              variant="plain"
              onClick={() =>
                setSelected(
                  chosen.length === ids.length ? new Set() : new Set(ids)
                )
              }
            >
              {chosen.length === ids.length ? "Deselect All" : "Select All"}
            </Button>
            <span className="flex-1" />
            <Button variant="plain" onClick={endSelect}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="plain"
              disabled={rows.length === 0}
              onClick={() => setSelecting(true)}
            >
              Select
            </Button>
            <Button
              variant="plain"
              disabled={!anyUnread}
              onClick={() => void actions.markRead(ids)}
            >
              Mark All Read
            </Button>
            <span className="flex-1" />
            <button
              type="button"
              aria-label="Notification settings"
              onClick={onSettings}
              className="inline-flex size-11 items-center justify-center rounded-full text-primary active:opacity-60"
            >
              <Settings aria-hidden size={22} />
            </button>
          </>
        )}
      </div>

      <DataView state={state} size="section">
        <DataView.Loading label="Loading notifications…">
          <SkeletonRows rows={4} rowClassName="h-16" />
        </DataView.Loading>
        <DataView.Empty icon={Bell} title="You’re all caught up" />
        <DataView.Error title="Couldn’t load notifications." />
        <DataView.Success>
          {(list: ReadonlyArray<NotificationRow>) => (
            <ul aria-label="Notifications" className="flex flex-col gap-2">
              {list.map((row) => (
                <NotificationItem
                  key={row.id}
                  row={row}
                  now={now}
                  selecting={selecting}
                  selected={selected.has(row.id)}
                  onToggle={() => toggle(row.id)}
                  onOpen={() => {
                    void actions.markRead([row.id])
                    onOpen(row)
                  }}
                  onMarkRead={() => void actions.markRead([row.id])}
                  onMarkUnread={() => void actions.markUnread([row.id])}
                  onDismiss={() => void actions.dismiss([row.id])}
                  onDelete={() => void actions.remove([row.id])}
                />
              ))}
            </ul>
          )}
        </DataView.Success>
      </DataView>

      {selecting ? (
        <div className="sticky bottom-0 flex gap-2 rounded-2xl glass p-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={chosen.length === 0}
            onClick={() => {
              void actions.markRead(chosen)
              endSelect()
            }}
          >
            Mark Read
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            disabled={chosen.length === 0}
            onClick={() => {
              void actions.markUnread(chosen)
              endSelect()
            }}
          >
            Mark Unread
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={chosen.length === 0}
            onClick={() => {
              void actions.remove(chosen)
              endSelect()
            }}
          >
            Delete
          </Button>
        </div>
      ) : rows.length > 0 ? (
        <Button
          variant="plain"
          className="self-center text-destructive"
          onClick={() => setConfirmClear(true)}
        >
          Clear All
        </Button>
      ) : null}

      <ConfirmAlert
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={
          filter === "all"
            ? "Clear all notifications?"
            : `Clear ${CATEGORY_NAME[filter]} notifications?`
        }
        description="They’re deleted from this device."
        confirmLabel="Clear All"
        tone="destructive"
        onConfirm={() => void actions.remove(ids)}
      />
    </div>
  )
}

function NotificationItem({
  row,
  now,
  selecting,
  selected,
  onToggle,
  onOpen,
  onMarkRead,
  onMarkUnread,
  onDismiss,
  onDelete,
}: {
  row: NotificationRow
  now: number
  selecting: boolean
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onMarkRead: () => void
  onMarkUnread: () => void
  onDismiss: () => void
  onDelete: () => void
}) {
  const Icon = ICON[row.category]
  const unread = row.readAt === undefined
  const urgent = row.priority === "high" || row.priority === "critical"
  const label = `${unread ? "Unread. " : ""}${CATEGORY_NAME[row.category]}: ${row.title}`
  return (
    <li className="overflow-hidden rounded-2xl shadow-xs">
      {/* swipe right: read/unread; swipe left (or all the way): delete (owner) */}
      <SwipeRow
        leading={
          selecting
            ? []
            : [
                unread
                  ? {
                      label: "Read",
                      icon: CheckCheck,
                      tone: "primary",
                      onAction: onMarkRead,
                    }
                  : {
                      label: "Unread",
                      icon: Bell,
                      tone: "primary",
                      onAction: onMarkUnread,
                    },
              ]
        }
        trailing={
          selecting
            ? []
            : [
                {
                  label: "Delete",
                  icon: Trash2,
                  tone: "destructive",
                  onAction: onDelete,
                },
              ]
        }
      >
        <div className="relative flex items-start gap-3 bg-card p-3 has-[button.row:active]:bg-muted">
          {selecting ? (
            <input
              type="checkbox"
              aria-label={`Select: ${row.title}`}
              checked={selected}
              onChange={onToggle}
              className="mt-2 size-5 shrink-0 accent-(--primary)"
            />
          ) : null}
          <span
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
              urgent && unread
                ? "bg-destructive/15 text-destructive"
                : "bg-primary/12 text-primary"
            )}
          >
            <Icon aria-hidden size={20} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <button
              type="button"
              aria-label={label}
              onClick={selecting ? onToggle : onOpen}
              className="row text-start text-body font-semibold after:absolute after:inset-0"
            >
              {row.title}
            </button>
            {row.body ? (
              <p className="line-clamp-2 text-subhead text-muted-foreground">
                {row.body}
              </p>
            ) : null}
            <p className="mt-0.5 text-footnote text-muted-foreground">
              {relative(row.createdAt, now || row.createdAt)}
            </p>
          </div>
          {unread ? (
            <span
              aria-hidden
              className="mt-2 size-2.5 shrink-0 rounded-full bg-primary"
            />
          ) : null}
          {selecting ? null : (
            <div className="relative z-10 -my-1 -mr-1">
              <ActionMenu
                label={`More for ${row.title}`}
                trigger={<Ellipsis aria-hidden size={20} />}
                actions={[
                  unread
                    ? { label: "Mark as Read", onSelect: onMarkRead }
                    : { label: "Mark as Unread", onSelect: onMarkUnread },
                  { label: "Dismiss", onSelect: onDismiss },
                  { label: "Delete", onSelect: onDelete, destructive: true },
                ]}
              />
            </div>
          )}
        </div>
      </SwipeRow>
    </li>
  )
}
