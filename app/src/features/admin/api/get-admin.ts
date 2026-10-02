// Reads for Settings → Admin (features/admin.md). Everything comes from Dexie; online-only admin
// requests refresh it (users, audit) through useAdminActions.
import { useCallback, useEffect } from "react"
import {
  useAdminActions,
  useDataRuntime,
  useWriter,
} from "@/lib/db/react/data-runtime"
import {
  useCollectionState,
  useLiveOr,
  useRecordState,
} from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import type {
  CommentRecord,
  EventSettingsRecord,
  UserRecord,
} from "@/lib/db/types"
import { deleteRecord } from "@/lib/sync/mutate"

export function useEventSettings(
  eventKey: string
): DataState<EventSettingsRecord> {
  const { db } = useDataRuntime()
  return useRecordState({
    enabled: true,
    source: { scope: `event:${eventKey}`, entity: "eventSettings" },
    query: () => db.eventSettings.get(eventKey),
    deps: [eventKey],
  })
}

export function useTeamNumber(): number | null | undefined {
  const { db } = useDataRuntime()
  return useLiveOr(
    async () => (await db.teamSettings.get("team"))?.teamNumber ?? null,
    [],
    undefined
  )
}

/** Every account, refreshed from GET /admin/users while the page is open. */
export function useUsers(
  online: boolean
): DataState<ReadonlyArray<UserRecord>> {
  const { db } = useDataRuntime()
  const admin = useAdminActions()
  useEffect(() => {
    if (online) void admin.refreshUsers()
  }, [admin, online])
  return useCollectionState({
    enabled: true,
    source: { scope: "user", entity: "user" },
    deps: [],
    share: (u) => `${u.id}:${u.rev}`,
    query: async () =>
      (await db.users.toArray()).sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      ),
  })
}

export function useUser(userId: string): DataState<UserRecord> {
  const { db } = useDataRuntime()
  return useRecordState({
    enabled: true,
    source: { scope: "user", entity: "user" },
    query: () => db.users.get(userId),
    deps: [userId],
  })
}

export interface AuditRow {
  id: string
  at: number
  actorId: string
  action: string
  entity: string
  recordId: string
  reason?: string | null
}

/** Moderation history (AD5): GET /events/{ek}/admin/audit cached in adminAudit. */
export function useAudit(
  eventKey: string,
  online: boolean
): DataState<ReadonlyArray<AuditRow>> {
  const { db } = useDataRuntime()
  const admin = useAdminActions()
  useEffect(() => {
    if (online) void admin.refreshAudit(eventKey)
  }, [admin, eventKey, online])
  return useCollectionState({
    enabled: true,
    source: [],
    deps: [eventKey],
    share: (a) => a.id,
    query: async () =>
      (
        (await db.adminAudit.toArray()) as unknown as Array<
          AuditRow & { eventKey: string }
        >
      )
        .filter((a) => a.eventKey === eventKey)
        .sort((a, b) => b.at - a.at),
  })
}

/** Team-visible notes from everyone (never others' private notes, ADR-040) for moderation. */
export function useTeamComments(
  eventKey: string
): DataState<ReadonlyArray<CommentRecord>> {
  const { db } = useDataRuntime()
  return useCollectionState({
    enabled: true,
    source: { scope: `event:${eventKey}`, entity: "comment" },
    deps: [eventKey],
    share: (c) => `${c.id}:${c.rev}`,
    query: async () =>
      (await db.comments.where("eventKey").equals(eventKey).toArray())
        .filter((c) => c.visibility === "team")
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 100),
  })
}

/** Names for ids (audit actors, comment authors). */
export function useUserNames(): ReadonlyMap<string, string> {
  const { db } = useDataRuntime()
  return useLiveOr(
    async () =>
      new Map((await db.users.toArray()).map((u) => [u.id, u.displayName])),
    [],
    new Map<string, string>()
  )
}

/** An admin deletes someone's note with a reason (AD5); queued like any delete. */
export function useModerateComment(): (
  id: string,
  reason: string
) => Promise<void> {
  const writer = useWriter()
  return useCallback(
    (id, reason) => deleteRecord(writer, "comment", id, { reason }),
    [writer]
  )
}
