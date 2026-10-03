// The in-app notification store (features/notifications-center.md N1): device-only Dexie rows,
// deduped by key. Writes go straight to Dexie: nothing here syncs (the switches that decide what
// notifies are the synced userSettings.notifications).
import type { VScoutDB } from "@/lib/db/schema"
import type { NotificationRow } from "@/lib/db/types"
import type { IdGen } from "@/lib/ids"

/** Listeners for notifications created on this device (the in-app banner). */
const created = new Set<(row: NotificationRow) => void>()
export function onNotified(listener: (row: NotificationRow) => void) {
  created.add(listener)
  return () => {
    created.delete(listener)
  }
}

export type NotifyInput = Omit<
  NotificationRow,
  "id" | "createdAt" | "readAt" | "dismissedAt"
>

const RANK: Record<NotificationRow["priority"], number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
}

const DAY = 86_400_000
const READ_TTL = 7 * DAY
const MAX_AGE = 30 * DAY
const MAX_ROWS = 200

/**
 * Creates the notification unless its key exists (dismissed ones included, so a dismissed thing
 * doesn't come back). With `refresh` (system items that follow a condition), an existing row takes
 * the new text, and becomes unread again if its priority went up. Returns the created row or null.
 */
export async function notify(
  db: VScoutDB,
  input: NotifyInput,
  opts: { now: number; ids: IdGen; refresh?: boolean }
): Promise<NotificationRow | null> {
  return db
    .transaction("rw", db.notifications, async () => {
      const existing = await db.notifications
        .where("key")
        .equals(input.key)
        .first()
      if (existing) {
        if (!opts.refresh) return null
        const raised = RANK[input.priority] > RANK[existing.priority]
        const next: NotificationRow = { ...existing, ...input }
        if (raised) {
          delete next.readAt
          delete next.dismissedAt
        }
        await db.notifications.put(next)
        return null
      }
      const row: NotificationRow = {
        ...input,
        id: opts.ids.newId(),
        createdAt: opts.now,
      }
      await db.notifications.add(row)
      return row
    })
    .then((row) => {
      if (row) for (const l of created) l(row)
      return row
    })
}

/** The condition behind a system item cleared: delete it so it can come back later. */
export async function retract(db: VScoutDB, key: string): Promise<void> {
  await db.notifications.where("key").equals(key).delete()
}

export async function markRead(
  db: VScoutDB,
  ids: ReadonlyArray<string>,
  now: number
): Promise<void> {
  await db.notifications
    .where("id")
    .anyOf([...ids])
    .modify((r) => {
      r.readAt ??= now
    })
}

export async function markUnread(
  db: VScoutDB,
  ids: ReadonlyArray<string>
): Promise<void> {
  await db.notifications
    .where("id")
    .anyOf([...ids])
    .modify((r) => {
      delete r.readAt
    })
}

/** Opening a thread reads its notifications (criterion 14). */
export async function markGroupRead(
  db: VScoutDB,
  group: string,
  now: number
): Promise<void> {
  await db.notifications
    .filter((r) => r.group === group && r.readAt === undefined)
    .modify((r) => {
      r.readAt = now
    })
}

/** Hidden from the list; the key stays so it doesn't notify again. */
export async function dismiss(
  db: VScoutDB,
  ids: ReadonlyArray<string>,
  now: number
): Promise<void> {
  await db.notifications
    .where("id")
    .anyOf([...ids])
    .modify((r) => {
      r.dismissedAt = now
      r.readAt ??= now
    })
}

export async function remove(
  db: VScoutDB,
  ids: ReadonlyArray<string>
): Promise<void> {
  await db.notifications.bulkDelete([...ids])
}

/** Read or dismissed after 7 days, anything after 30, and never more than 200 rows. */
export async function prune(db: VScoutDB, now: number): Promise<void> {
  await db.transaction("rw", db.notifications, async () => {
    await db.notifications
      .filter(
        (r) =>
          now - r.createdAt > MAX_AGE ||
          ((r.readAt !== undefined || r.dismissedAt !== undefined) &&
            now - r.createdAt > READ_TTL)
      )
      .delete()
    const count = await db.notifications.count()
    if (count > MAX_ROWS) {
      const oldest = await db.notifications
        .orderBy("createdAt")
        .limit(count - MAX_ROWS)
        .primaryKeys()
      await db.notifications.bulkDelete(oldest)
    }
  })
}

const urgent = (r: NotificationRow) =>
  r.readAt === undefined && RANK[r.priority] >= RANK.high

/** Unread high and critical first (critical before high), then newest first. */
export function orderNotifications(
  rows: ReadonlyArray<NotificationRow>
): Array<NotificationRow> {
  return [...rows].sort((a, b) => {
    const ua = urgent(a)
    const ub = urgent(b)
    if (ua !== ub) return ua ? -1 : 1
    if (ua && a.priority !== b.priority)
      return RANK[b.priority] - RANK[a.priority]
    return b.createdAt - a.createdAt
  })
}

/** The bell's badge: unread, not dismissed; urgent when any of them is high or critical. */
export function summarize(rows: ReadonlyArray<NotificationRow>): {
  unread: number
  urgent: boolean
} {
  const open = rows.filter(
    (r) => r.readAt === undefined && r.dismissedAt === undefined
  )
  return {
    unread: open.length,
    urgent: open.some((r) => RANK[r.priority] >= RANK.high),
  }
}
