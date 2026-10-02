// Online-only actions on the shared alliance board (ADR-032/064, http-api-contract §4.6). Live
// coordination: never queued in the outbox (a pick replayed 10 minutes later would be wrong). Sent
// as class "live" (MQTT RPC first, HTTP fallback) with the action id as the Idempotency-Key, so a
// pick that reached the server before an RPC timeout isn't applied twice by the HTTP retry.
import { wirePitMap } from "@/lib/contracts/pit-map"
import { setKv } from "@/lib/db/kv"
import { decodeRecord } from "@/lib/api/adapters/entity-registry"
import type { DomainChange } from "@/lib/api/adapters/change-envelope-adapter"
import type { ApiClient } from "@/lib/api/api-client"
import { ApiError, OfflineError } from "@/lib/api/errors"
import type { BoardAction } from "@/lib/contracts/alliance-board"
import type { AllianceBoardRecord } from "@/lib/db/types"
import type { EntityName } from "@/lib/contracts/entities"
import { applyChanges } from "./apply-envelope"
import { ENTITY_DEFS, recordKey } from "./entity-registry"
import type { ApplyCtx } from "./apply-envelope"

export type BoardActionResult =
  | { kind: "ok"; board: AllianceBoardRecord }
  /** someone already recorded the same pick: not an error (scout-tab.md B) */
  | { kind: "already"; board: AllianceBoardRecord; actorId: string | null }
  /** the board moved on; the sheet stays open on the fresh board */
  | { kind: "conflict"; board: AllianceBoardRecord }
  | { kind: "offline" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }

export interface LiveDeps extends ApplyCtx {
  api: ApiClient
}

async function store(
  deps: LiveDeps,
  raw: unknown
): Promise<AllianceBoardRecord | null> {
  const decoded = decodeRecord("allianceBoard", raw)
  if (!decoded.ok) return null
  const board = decoded.value
  const change = {
    entity: "allianceBoard",
    op: "upsert",
    id: board.eventKey,
    rev: board.rev,
    eventKey: board.eventKey,
    ts: board.updatedAt,
    record: board,
  } as DomainChange
  await applyChanges([change], deps)
  return board
}

function samePick(board: AllianceBoardRecord, action: BoardAction): boolean {
  if (action.kind === "pick")
    return board.alliances.some(
      (a) => a.seed === action.seed && a.picks.includes(action.team)
    )
  if (action.kind === "decline") return board.declined.includes(action.team)
  return false
}

export async function sendBoardAction(
  deps: LiveDeps,
  eventKey: string,
  baseRev: number,
  action: BoardAction
): Promise<BoardActionResult> {
  const id = deps.newId()
  try {
    const res = await deps.api.request({
      method: "POST",
      path: `/events/${eventKey}/alliance-board/actions`,
      class: "live",
      idempotencyKey: id,
      body: { id, baseRev, action },
    })
    const board = await store(deps, res.body)
    return board
      ? { kind: "ok", board }
      : { kind: "error", message: "Invalid server response" }
  } catch (error) {
    if (error instanceof OfflineError) return { kind: "offline" }
    if (error instanceof ApiError) {
      if (error.status === 409) {
        const board = await store(deps, error.problem.current)
        if (!board) return { kind: "error", message: error.message }
        if (samePick(board, action)) {
          const last = [...board.history]
            .reverse()
            .find(
              (h) =>
                "team" in h && h.team === ("team" in action ? action.team : -1)
            )
          return { kind: "already", board, actorId: last?.actorId ?? null }
        }
        return { kind: "conflict", board }
      }
      if (error.status === 403) return { kind: "forbidden" }
      return { kind: "error", message: error.message }
    }
    return { kind: "error", message: String(error) }
  }
}

export type OnlineResult =
  | { kind: "ok" }
  | { kind: "offline" }
  | { kind: "error"; message: string; code?: string }

export function fail(error: unknown): OnlineResult {
  if (error instanceof OfflineError) return { kind: "offline" }
  if (error instanceof ApiError)
    return { kind: "error", message: error.message, code: error.problem.code }
  return { kind: "error", message: String(error) }
}

/** Change password (ADR-038, http-api-contract §2): online only. */
export async function changePassword(
  deps: Pick<LiveDeps, "api">,
  currentPassword: string,
  newPassword: string
): Promise<OnlineResult> {
  try {
    await deps.api.request({
      method: "POST",
      path: "/me/password",
      class: "auth",
      body: { currentPassword, newPassword },
    })
    return { kind: "ok" }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Recently Deleted → Restore (ADR-029). A delete that hasn't been sent is simply taken back;
 * one the server has is restored with POST /{collection}/{id}/restore (same id, rev+1).
 */
export async function restoreRecord(
  deps: LiveDeps,
  entity: string,
  id: string
): Promise<OnlineResult> {
  const def = ENTITY_DEFS[entity as EntityName]
  const tomb = await deps.db.tombstones.get([entity, id])
  if (!tomb) return { kind: "error", message: "Nothing to restore" }
  const ops = await deps.db.outbox
    .where("recordKey")
    .equals(recordKey(entity, id))
    .toArray()
  const deletes = ops.filter((o) => o.kind === "delete")
  // never sent: seal() sets baseRev on the first attempt (a delete has no body to seal)
  const queuedDelete = deletes.find(
    (o) => o.state === "queued" && o.baseRev === undefined
  )
  // sent but not acknowledged (the app was closed mid-send): the server may have it, and a replay
  // would delete the restored record again. Let it finish first.
  if (!queuedDelete && deletes.length > 0)
    return {
      kind: "error",
      code: "delete_syncing",
      message: "This delete is still syncing. Try again in a moment.",
    }
  if (queuedDelete?.seq !== undefined && tomb.snapshot) {
    const seq = queuedDelete.seq
    await deps.db.transaction(
      "rw",
      [deps.db.table(def.table), deps.db.outbox, deps.db.tombstones],
      async () => {
        await deps.db.outbox.delete(seq)
        await deps.db.table(def.table).put(tomb.snapshot)
        await deps.db.tombstones.delete([entity, id])
      }
    )
    return { kind: "ok" }
  }
  if (!def.collection)
    return { kind: "error", message: "This can’t be restored" }
  try {
    const res = await deps.api.request({
      method: "POST",
      path: `/${def.collection}/${id}/restore`,
      class: "write",
      idempotencyKey: deps.newId(),
      body: { baseRev: tomb.rev },
    })
    const decoded = decodeRecord(entity as EntityName, res.body)
    if (!decoded.ok)
      return { kind: "error", message: "Invalid server response" }
    const rec = decoded.value as {
      rev: number
      updatedAt: number
      eventKey?: string | null
    }
    await applyChanges(
      [
        {
          entity,
          op: "upsert",
          id,
          rev: rec.rev,
          eventKey: rec.eventKey ?? null,
          ts: rec.updatedAt,
          record: decoded.value,
        } as DomainChange,
      ],
      deps
    )
    return { kind: "ok" }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Refresh the cached pit map (http-api-contract §5.3). A 404 means "not published yet" and is
 * cached as null; offline keeps whatever is cached.
 */
export async function refreshPitMap(
  deps: Pick<LiveDeps, "api" | "db" | "now">,
  eventKey: string
): Promise<OnlineResult> {
  try {
    const res = await deps.api.request({
      method: "GET",
      path: `/events/${eventKey}/pit-map`,
      class: "delta",
    })
    const parsed = wirePitMap.safeParse(res.body)
    if (!parsed.success) return { kind: "error", message: "Unexpected pit map" }
    await setKv(deps.db, `pitMap:${eventKey}`, {
      map: parsed.data,
      fetchedAt: deps.now(),
    })
    return { kind: "ok" }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      await setKv(deps.db, `pitMap:${eventKey}`, {
        map: null,
        fetchedAt: deps.now(),
      })
      return { kind: "ok" }
    }
    return fail(error)
  }
}
