// Outbox flush (data-layer §7.7). One op at a time in seq order; per-record ordering is strict and
// unrelated records never block each other. A 2xx is applied through applyChange with the op's id,
// so the write response and its MQTT echo converge on the same path (ADR-017).
import type { Table } from "dexie"
import { decodeRecord } from "@/lib/api/adapters/entity-registry"
import type { DomainChange } from "@/lib/api/adapters/change-envelope-adapter"
import type { ApiClient } from "@/lib/api/api-client"
import { ApiError, OfflineError } from "@/lib/api/errors"
import type { EntityName } from "@/lib/contracts/entities"
import type { KnownErrorCode } from "@/lib/contracts/problem"
import { deleteResponse } from "@/lib/contracts/sync-changes"
import { setKv } from "@/lib/db/kv"
import type { ConflictKind, OutboxOp } from "@/lib/db/types"
import { logger } from "@/lib/logger"
import { applyChanges } from "./apply-envelope"
import type { ApplyCtx } from "./apply-envelope"
import { retryDelay } from "./backoff"
import { recordConflict } from "./conflict-store"
import { ENTITY_DEFS } from "./entity-registry"
import { buildBody, buildRequest } from "./requests"

export interface PushDeps extends ApplyCtx {
  api: ApiClient
  session: () => { userId: string } | null
  random?: () => number
}

export type FlushStop = "offline" | "auth" | "upgrade" | "rate-limited" | null

export interface FlushResult {
  sent: number
  stoppedBy: FlushStop
  /** userSettings 409s were rebased; flush again to send them */
  needsRerun: boolean
}

/** An op read from Dexie always has its auto-increment key. */
type StoredOp = OutboxOp & { seq: number }

type Row = Record<string, unknown> & {
  id: string
  rev: number
  syncState?: string
  eventKey?: string | null
}

const CONFLICT_KINDS: Partial<Record<KnownErrorCode, ConflictKind>> = {
  rev_conflict: "rev-mismatch",
  deleted: "deleted-remotely",
  duplicate: "duplicate",
  already_exists: "duplicate",
}

function tableOf(deps: PushDeps, entity: string) {
  return deps.db.table(
    ENTITY_DEFS[entity as EntityName].table
  ) as unknown as Table<Row, string | number>
}

function txTables(deps: PushDeps, op: StoredOp) {
  return [
    tableOf(deps, op.entity),
    deps.db.outbox,
    deps.db.conflicts,
    deps.db.tombstones,
  ]
}

async function isBlockedByOrder(
  deps: PushDeps,
  op: StoredOp
): Promise<boolean> {
  const seq = op.seq
  const earlier = await deps.db.outbox
    .where("recordKey")
    .equals(op.recordKey)
    .filter((o) => o.seq !== undefined && o.seq < seq)
    .count()
  if (earlier > 0) return true
  if (!op.dependsOn?.length) return false
  return (
    (await deps.db.outbox.where("recordKey").anyOf(op.dependsOn).count()) > 0
  )
}

/** Seals the op on its first attempt: the body and baseRev are frozen for every retry. */
async function seal(deps: PushDeps, op: StoredOp): Promise<StoredOp | null> {
  return deps.db.transaction("rw", txTables(deps, op), async () => {
    const found = await deps.db.outbox.get(op.seq)
    if (found?.state !== "queued") return null // acked by an echo meanwhile
    const fresh: StoredOp = { ...found, seq: op.seq }
    if (fresh.sealedBody !== undefined) {
      await deps.db.outbox.update(fresh.seq, { state: "inflight" })
      return { ...fresh, state: "inflight" }
    }
    const def = ENTITY_DEFS[fresh.entity as EntityName]
    const row = await tableOf(deps, fresh.entity).get(def.key(fresh.recordId))
    const tomb = await deps.db.tombstones.get([fresh.entity, fresh.recordId])
    const baseRev = fresh.kind === "delete" ? (tomb?.rev ?? 0) : (row?.rev ?? 0)
    const sealedBody = buildBody(fresh, row)
    await deps.db.outbox.update(fresh.seq, {
      state: "inflight",
      sealedBody,
      baseRev,
    })
    return { ...fresh, state: "inflight", sealedBody, baseRev }
  })
}

function successChange(op: StoredOp, body: unknown): DomainChange | null {
  if (op.kind === "delete") {
    const b = deleteResponse.safeParse(body)
    if (!b.success) return null
    return {
      entity: op.entity as EntityName,
      op: "delete",
      id: op.recordId,
      rev: b.data.rev,
      eventKey: op.eventKey,
      ts: Date.parse(b.data.deletedAt),
      opId: op.opId,
    }
  }
  const decoded = decodeRecord(op.entity as EntityName, body)
  if (!decoded.ok) return null
  // every domain record carries the server's rev and updatedAt (epoch ms)
  const meta = decoded.value as { rev: number; updatedAt: number }
  return {
    entity: op.entity as EntityName,
    op: "upsert",
    id: op.recordId,
    rev: meta.rev,
    eventKey: op.eventKey,
    ts: meta.updatedAt,
    opId: op.opId,
    record: decoded.value,
  } as DomainChange
}

async function onSuccess(
  deps: PushDeps,
  op: StoredOp,
  body: unknown
): Promise<boolean> {
  const change = successChange(op, body)
  if (!change) {
    logger.error("sync", "write response failed validation", {
      entity: op.entity,
      op: op.kind,
    })
    await markFailed(deps, op, { message: "Invalid server response" })
    return false
  }
  // the echo may already have acked this op ("stale"); then just make sure the op is gone
  const [result] = await applyChanges([change], deps)
  if (result === "stale") await deps.db.outbox.delete(op.seq)
  return true
}

async function markFailed(
  deps: PushDeps,
  op: StoredOp,
  error: { status?: number; code?: string; message: string }
) {
  await deps.db.outbox.update(op.seq, {
    state: "failed",
    lastError: { ...error, at: deps.now() },
  })
}

async function requeue(
  deps: PushDeps,
  op: StoredOp,
  opts: {
    countAttempt: boolean
    retryAfterMs?: number | null
    message: string
    status?: number
    code?: string
  }
) {
  const attempts = op.attempts + (opts.countAttempt ? 1 : 0)
  await deps.db.outbox.update(op.seq, {
    state: "queued",
    attempts,
    nextAttemptAt:
      deps.now() +
      (opts.retryAfterMs ??
        (opts.countAttempt ? retryDelay(attempts, deps.random) : 0)),
    lastError: {
      message: opts.message,
      at: deps.now(),
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.code ? { code: opts.code } : {}),
    },
  })
}

/** 409: a conflict row with the server copy; userSettings instead rebases its keys and retries. */
async function onConflict(
  deps: PushDeps,
  op: StoredOp,
  error: ApiError
): Promise<"rerun" | "conflict"> {
  const kind =
    CONFLICT_KINDS[error.problem.code as KnownErrorCode] ?? "rev-mismatch"
  const currentRaw = error.problem.current
  const decoded = currentRaw
    ? decodeRecord(op.entity as EntityName, currentRaw)
    : null
  const remote = decoded?.ok ? (decoded.value as unknown as Row) : null
  const table = tableOf(deps, op.entity)
  const def = ENTITY_DEFS[op.entity as EntityName]

  return deps.db.transaction("rw", txTables(deps, op), async () => {
    const row = await table.get(def.key(op.recordId))
    // the server's revision, even when its copy doesn't decode (a bare or older document): a
    // settings patch only needs the rev to go again; without it Keep Mine looped (owner NC-3)
    const rawRev =
      typeof currentRaw === "object" &&
      currentRaw !== null &&
      typeof (currentRaw as { rev?: unknown }).rev === "number"
        ? (currentRaw as { rev: number }).rev
        : null
    if (op.entity === "userSettings" && row && (remote || rawRev !== null)) {
      // per-key last-writer-wins (ADR-033): my changed keys on top of the server copy, sent again
      const merged: Row = remote
        ? { ...remote, rev: remote.rev, syncState: "pending" }
        : { ...row, rev: rawRev ?? row.rev, syncState: "pending" }
      for (const k of op.patchKeys ?? []) merged[k] = row[k]
      await table.put(merged)
      // a different body is a different operation: a new Idempotency-Key, or the server
      // answers 422 idempotency_key_reuse (http-api-contract §4.1)
      await deps.db.outbox.update(op.seq, {
        opId: deps.newId(),
        state: "queued",
        sealedBody: undefined,
        baseRev: undefined,
      })
      return "rerun"
    }
    const tomb = await deps.db.tombstones.get([op.entity, op.recordId])
    await recordConflict(
      deps.db,
      {
        entity: op.entity,
        recordId: op.recordId,
        eventKey: op.eventKey,
        kind,
        source: "push",
        local: row ?? tomb?.snapshot ?? null,
        remote,
        baseRev: op.baseRev ?? row?.rev ?? 0,
        remoteRev: remote?.rev ?? null,
      },
      { now: deps.now(), newId: deps.newId }
    )
    if (row) await table.put({ ...row, syncState: "conflict" })
    return "conflict"
  })
}

/** 400/422/403/404: the op stops; the user fixes, retries or discards it (conflict sheet). */
async function onRejected(
  deps: PushDeps,
  op: StoredOp,
  error: ApiError
): Promise<void> {
  const table = tableOf(deps, op.entity)
  const def = ENTITY_DEFS[op.entity as EntityName]
  const missing = error.status === 404 && op.kind !== "create"
  const forbidden = error.status === 403
  await deps.db.transaction("rw", txTables(deps, op), async () => {
    const row = await table.get(def.key(op.recordId))
    const tomb = await deps.db.tombstones.get([op.entity, op.recordId])
    await recordConflict(
      deps.db,
      {
        entity: op.entity,
        recordId: op.recordId,
        eventKey: op.eventKey,
        kind: missing
          ? "deleted-remotely"
          : forbidden
            ? "forbidden"
            : "rejected",
        source: "push",
        local: row ?? tomb?.snapshot ?? null,
        remote: null,
        baseRev: op.baseRev ?? row?.rev ?? 0,
        remoteRev: null,
        ...(error.problem.errors
          ? {
              serverErrors: error.problem.errors.map((e) => ({
                path: e.path,
                code: e.code,
                message: e.message ?? e.code,
              })),
            }
          : {}),
      },
      { now: deps.now(), newId: deps.newId }
    )
    await deps.db.outbox.update(op.seq, {
      state: missing ? "blocked" : "failed",
      lastError: {
        status: error.status,
        code: error.problem.code,
        message: error.message,
        at: deps.now(),
      },
    })
    if (op.kind === "delete" && forbidden && tomb?.snapshot) {
      // a delete the server refused: the record comes back (http-api-contract §1.2)
      await table.put({ ...(tomb.snapshot as Row), syncState: "synced" })
      await deps.db.tombstones.delete([op.entity, op.recordId])
    } else if (row)
      await table.put({ ...row, syncState: missing ? "conflict" : "rejected" })
  })
}

/**
 * A robot photo (http-api-contract §5.2): multipart over HTTP only (class "media"). The response
 * carries the stored file's facts; the record is completed with what this device already knows.
 */
async function sendUpload(
  deps: PushDeps,
  op: StoredOp,
  path: string
): Promise<boolean> {
  const upload = await deps.db.mediaUploads.get(op.recordId)
  if (!upload) {
    await markFailed(deps, op, {
      message: "The photo is no longer on this device",
    })
    return false
  }
  const form = new FormData()
  form.set("id", upload.id)
  form.set("kind", "robotPhoto")
  form.set("teamNumber", String(upload.teamNumber))
  form.set(
    "file",
    upload.blob,
    `${upload.id}.${upload.mime === "image/webp" ? "webp" : "jpg"}`
  )
  const res = await deps.api.request({
    method: "POST",
    path,
    class: "media",
    idempotencyKey: op.opId,
    body: form,
  })
  const now = new Date(deps.now()).toISOString()
  const server = (res.body ?? {}) as Record<string, unknown>
  const record = {
    eventKey: upload.eventKey,
    teamNumber: upload.teamNumber,
    kind: "robotPhoto",
    authorId: deps.session()?.userId ?? upload.userId,
    createdAt: new Date(upload.createdAt).toISOString(),
    updatedAt: now,
    ...server,
  }
  const ok = await onSuccess(deps, op, record)
  if (ok) await deps.db.mediaUploads.update(upload.id, { uploadState: "done" })
  return ok
}

export async function flushOutbox(deps: PushDeps): Promise<FlushResult> {
  const user = deps.session()
  const result: FlushResult = { sent: 0, stoppedBy: null, needsRerun: false }
  if (!user) return result
  const due = await deps.db.outbox
    .where("state")
    .equals("queued")
    .filter((o) => o.userId === user.userId && o.nextAttemptAt <= deps.now())
    .sortBy("seq")

  // rows read from Dexie always carry their auto-increment key
  for (const candidate of due as Array<StoredOp>) {
    if (await isBlockedByOrder(deps, candidate)) continue
    const op = await seal(deps, candidate)
    if (!op) continue
    try {
      const req = buildRequest(op)
      if (op.kind === "upload") {
        const sent = await sendUpload(deps, op, req.path)
        if (sent) result.sent++
        continue
      }
      const res = await deps.api.request({
        method: req.method,
        path: req.path,
        class: "write",
        idempotencyKey: op.opId,
        ...(req.query ? { query: req.query } : {}),
        ...(req.body === undefined || req.body === null
          ? {}
          : { body: req.body }),
      })
      if (await onSuccess(deps, op, res.body)) result.sent++
    } catch (error) {
      if (error instanceof OfflineError) {
        await requeue(deps, op, { countAttempt: true, message: error.message })
        result.stoppedBy = "offline" // the next op would fail the same way
        break
      }
      if (!(error instanceof ApiError)) {
        logger.error("sync", "push failed", { error: String(error) })
        await requeue(deps, op, { countAttempt: true, message: String(error) })
        continue
      }
      const { status } = error
      const code = error.problem.code
      if (status === 409 && code === "request_in_progress") {
        // the server is still handling this key: ask again shortly, it isn't a conflict (§4.1)
        await requeue(deps, op, {
          countAttempt: false,
          retryAfterMs: error.retryAfterMs ?? 1000,
          message: error.message,
          status,
          code,
        })
      } else if (status === 409) {
        if ((await onConflict(deps, op, error)) === "rerun")
          result.needsRerun = true
      } else if (
        status === 400 ||
        status === 422 ||
        status === 403 ||
        status === 404
      ) {
        await onRejected(deps, op, error)
      } else if (status === 401) {
        // the client already tried one refresh: the session is gone; don't count an attempt
        await requeue(deps, op, {
          countAttempt: false,
          message: error.message,
          status,
          code,
        })
        result.stoppedBy = "auth"
        break
      } else if (status === 426) {
        await requeue(deps, op, {
          countAttempt: false,
          message: error.message,
          status,
          code,
        })
        await setKv(deps.db, "needsAppUpdate", true)
        result.stoppedBy = "upgrade"
        break
      } else {
        // 408, 425, 429, 5xx: back off (honoring Retry-After); a 5xx doesn't stop other records
        await requeue(deps, op, {
          countAttempt: true,
          retryAfterMs: error.retryAfterMs,
          message: error.message,
          status,
          code,
        })
        if (status === 429) {
          result.stoppedBy = "rate-limited"
          break
        }
      }
    }
  }
  return result
}
