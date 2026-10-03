// Pull path (data-layer §7.4, §7.6): page through /sync/changes per (scope, entity) cursor. Each page
// and its cursors commit in ONE transaction, so a crash mid-pull just re-applies a page (no-op by the
// rev rule). No cursor = a compacted snapshot (bootstrap). Never fetch inside a transaction.
import { decodeSyncChanges } from "@/lib/api/adapters/sync-changes-adapter"
import type { ApiClient } from "@/lib/api/api-client"
import { ApiError } from "@/lib/api/errors"
import type { EntityName } from "@/lib/contracts/entities"
import type { SyncCursorRow } from "@/lib/db/types"
import { logger } from "@/lib/logger"
import { applyChange, tablesForApply } from "./apply-envelope"
import type { ApplyCtx } from "./apply-envelope"

export interface PullDeps extends ApplyCtx {
  api: ApiClient
  /** RPC asks for smaller pages (mqtt.md §9.8); HTTP default */
  pageSize?: number
  onProgress?: (p: { scope: string; recordsApplied: number }) => void
}

export type PullOutcome = "done" | "forbidden"

export async function pullScope(
  deps: PullDeps,
  scope: string,
  entities: ReadonlyArray<EntityName>
): Promise<PullOutcome> {
  let resetOnce = false
  let applied = 0
  for (;;) {
    const rows = await deps.db.syncCursors
      .where("[scope+entity]")
      .anyOf(entities.map((e) => [scope, e]))
      .toArray()
    const known = new Map(rows.map((r) => [r.entity, r]))
    const cursors = Object.fromEntries(
      rows.flatMap((r) => (r.cursor ? [[r.entity, r.cursor]] : []))
    )
    const bootstrap = entities.some((e) => !known.get(e)?.cursor)

    if (bootstrap)
      await deps.db.syncCursors.bulkPut(
        entities
          .filter((e) => known.get(e)?.bootstrapState !== "done")
          .map((e): SyncCursorRow => ({
            scope,
            entity: e,
            cursor: known.get(e)?.cursor ?? null,
            lastPulledAt: known.get(e)?.lastPulledAt ?? 0,
            bootstrapState: "running",
          }))
      )

    let body: unknown
    try {
      const res = await deps.api.request({
        method: "GET",
        path: "/sync/changes",
        class: bootstrap ? "bootstrap" : "delta",
        query: {
          scope,
          entities: entities.join(","),
          cursors: JSON.stringify(cursors),
          limit: String(deps.pageSize ?? (bootstrap ? 1000 : 500)),
        },
      })
      body = res.body
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.problem.code === "cursor_expired" &&
        !resetOnce
      ) {
        // older than the server's retention: start these entities over (re-bootstrap)
        resetOnce = true
        await deps.db.syncCursors
          .where("[scope+entity]")
          .anyOf(entities.map((e) => [scope, e]))
          .delete()
        continue
      }
      if (error instanceof ApiError && error.status === 403) {
        await deps.db.syncCursors.bulkPut(
          entities.map((e) => ({
            scope,
            entity: e,
            cursor: null,
            lastPulledAt: deps.now(),
            bootstrapState: "none" as const,
            forbidden: true as const,
          }))
        )
        return "forbidden"
      }
      throw error
    }

    const page = decodeSyncChanges(body)
    if (!page.ok)
      throw new Error(`Invalid /sync/changes page: ${page.error.message}`)
    const { changes, rejected, cursors: next, hasMore } = page.value
    if (rejected.length)
      logger.warn("sync", `${rejected.length} invalid change(s) skipped`, {
        scope,
      })

    await deps.db.transaction(
      "rw",
      [...tablesForApply(deps.db, changes), deps.db.syncCursors],
      async () => {
        for (const c of changes) await applyChange(c, deps)
        await deps.db.syncCursors.bulkPut(
          entities.map((e): SyncCursorRow => ({
            scope,
            entity: e,
            cursor: next[e] ?? cursors[e] ?? null,
            lastPulledAt: deps.now(),
            bootstrapState: hasMore
              ? known.get(e)?.bootstrapState === "done"
                ? "done"
                : "running"
              : "done",
          }))
        )
      }
    )
    applied += changes.length
    deps.onProgress?.({ scope, recordsApplied: applied })
    if (!hasMore) return "done"
  }
}
