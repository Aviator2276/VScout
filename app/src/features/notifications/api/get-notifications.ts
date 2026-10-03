// Reads and actions for the notification center (features/notifications-center.md N1, N3).
import { useMemo } from "react"
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import type { DataState } from "@/lib/db/react/data-state"
import {
  useLiveOr,
  useLocalCollectionState,
} from "@/lib/db/react/data-state-hooks"
import type { NotificationRow } from "@/lib/db/types"
import {
  dismiss,
  markGroupRead,
  markRead,
  markUnread,
  orderNotifications,
  remove,
  summarize,
} from "./notifications-store"

export type NotificationCategory = NotificationRow["category"]

/** Not dismissed, in display order; `category` narrows the list. */
export function useNotifications(
  category: NotificationCategory | "all"
): DataState<ReadonlyArray<NotificationRow>> {
  const { db } = useDataRuntime()
  return useLocalCollectionState({
    enabled: true,
    deps: [category],
    query: async () =>
      orderNotifications(
        (await db.notifications.toArray()).filter(
          (r) =>
            r.dismissedAt === undefined &&
            (category === "all" || r.category === category)
        )
      ),
  })
}

const NONE = { unread: 0, urgent: false }

/** The bell's badge. */
export function useNotificationSummary(): { unread: number; urgent: boolean } {
  const { db } = useDataRuntime()
  return useLiveOr(
    async () => summarize(await db.notifications.toArray()),
    [],
    NONE
  )
}

export function useNotificationActions() {
  const { db } = useDataRuntime()
  return useMemo(
    () => ({
      markRead: (ids: ReadonlyArray<string>) => markRead(db, ids, Date.now()),
      markUnread: (ids: ReadonlyArray<string>) => markUnread(db, ids),
      dismiss: (ids: ReadonlyArray<string>) => dismiss(db, ids, Date.now()),
      remove: (ids: ReadonlyArray<string>) => remove(db, ids),
      markGroupRead: (group: string) => markGroupRead(db, group, Date.now()),
    }),
    [db]
  )
}

/** Unread, not dismissed, in one category (the Messages tab badge counts announcements). */
export function useUnreadCount(
  category: NotificationCategory,
  group?: string
): number {
  const { db } = useDataRuntime()
  return useLiveOr(
    async () =>
      (await db.notifications.toArray()).filter(
        (r) =>
          r.category === category &&
          r.readAt === undefined &&
          r.dismissedAt === undefined &&
          (group === undefined || r.group === group)
      ).length,
    [db, category, group],
    0
  )
}
