// The only code that writes server data to Dexie (data-layer §7.5, ADR-015/017/018). MQTT,
// /sync/changes pages and write responses all come through here as decoded DomainChanges.
import type { Table } from "dexie"
import type { DomainChange } from "@/lib/api/adapters/change-envelope-adapter"
import type { VScoutDB } from "@/lib/db/schema"
import type { SyncState, TombstoneRow } from "@/lib/db/types"
import { logger } from "@/lib/logger"
import { recordConflict } from "./conflict-store"
import { ENTITY_DEFS, recordKey, tablesFor } from "./entity-registry"
import type { EntityDef } from "./entity-registry"
import { ingestGamePayload } from "./game-payload"
import type { GameLookup, PayloadRecord } from "./game-payload"

export type ApplyResult = "applied" | "stale" | "echo-ack" | "conflict"

export interface ApplyCtx {
  db: VScoutDB
  games: GameLookup
  now: () => number
  newId: () => string
}

type Row = Record<string, unknown> & { rev?: number; syncState?: SyncState }
type AnyTable = Table<Row, string | number>

const LOCAL_CHANGES = new Set<SyncState | undefined>([
  "pending",
  "conflict",
  "rejected",
])

function tableOf(db: VScoutDB, def: EntityDef): AnyTable {
  return db[def.table] as unknown as AnyTable
}

function toRow(change: DomainChange, def: EntityDef, ctx: ApplyCtx): Row {
  const record = change.record as unknown as Row
  return def.gameForm
    ? (ingestGamePayload(
        record as unknown as PayloadRecord,
        def.gameForm,
        ctx.games
      ) as unknown as Row)
    : record
}

async function writeServerState(
  change: DomainChange,
  def: EntityDef,
  ctx: ApplyCtx,
  hadTombstone: boolean
): Promise<void> {
  const table = tableOf(ctx.db, def)
  if (change.op === "delete") {
    await table.delete(def.key(change.id))
    const tomb: TombstoneRow = {
      entity: change.entity,
      id: change.id,
      rev: change.rev,
      deletedAt: change.ts,
      eventKey: change.eventKey,
      syncState: "synced",
    }
    await ctx.db.tombstones.put(tomb)
    return
  }
  await table.put(toRow(change, def, ctx))
  // restored (undo after sync, ADR-029): the record is alive again
  if (hadTombstone) await ctx.db.tombstones.delete([change.entity, change.id])
}

/** userSettings with unsent edits: take the server document, keep the keys we're still sending. */
async function mergeUserDoc(
  change: DomainChange,
  local: Row,
  ctx: ApplyCtx
): Promise<void> {
  const ops = await ctx.db.outbox
    .where("recordKey")
    .equals(recordKey(change.entity, change.id))
    .toArray()
  const keys = new Set(ops.flatMap((o) => o.patchKeys ?? []))
  const merged: Row = {
    ...(change.record as unknown as Row),
    rev: change.rev,
    syncState: "pending",
  }
  for (const k of keys) merged[k] = local[k]
  await tableOf(ctx.db, ENTITY_DEFS.userSettings).put(merged)
}

/** Apply one change. Must run inside a transaction over tablesForApply(). */
export async function applyChange(
  change: DomainChange,
  ctx: ApplyCtx
): Promise<ApplyResult> {
  const def = ENTITY_DEFS[change.entity]
  const table = tableOf(ctx.db, def)
  const key = def.key(change.id)
  const row = await table.get(key)
  const tomb = await ctx.db.tombstones.get([change.entity, change.id])

  // 2. the rev rule: never write an equal or older revision (an identical put re-fires live queries)
  const localRev = Math.max(row?.rev ?? -1, tomb?.rev ?? -1)
  if (change.rev <= localRev) return "stale"

  // 3. our own write echoed back (ADR-017)
  if (change.opId) {
    const op = await ctx.db.outbox.where("opId").equals(change.opId).first()
    if (
      op?.seq !== undefined &&
      op.recordKey === recordKey(change.entity, change.id)
    ) {
      await ctx.db.outbox.delete(op.seq)
      const remaining = await ctx.db.outbox
        .where("recordKey")
        .equals(op.recordKey)
        .count()
      if (remaining === 0)
        await writeServerState(change, def, ctx, tomb !== undefined)
      else if (row)
        await table.put({ ...row, rev: change.rev }) // later edits still pending: rebase only
      else if (tomb) await ctx.db.tombstones.put({ ...tomb, rev: change.rev })
      return "echo-ack"
    }
  }

  // 4. unsent local changes and a newer server version
  const localDeletePending = !row && tomb?.syncState === "pending"
  if (LOCAL_CHANGES.has(row?.syncState) || localDeletePending) {
    if (def.cls === "userDoc" && row && change.op === "upsert") {
      await mergeUserDoc(change, row, ctx)
      return "applied"
    }
    if (
      def.cls === "owned" ||
      def.cls === "singleton" ||
      def.cls === "userDoc"
    ) {
      await recordConflict(
        ctx.db,
        {
          entity: change.entity,
          recordId: change.id,
          eventKey: change.eventKey,
          kind: change.op === "delete" ? "deleted-remotely" : "rev-mismatch",
          source: "pull",
          local: row ?? tomb?.snapshot ?? null,
          remote: change.record ?? null,
          baseRev: row?.rev ?? tomb?.rev ?? 0,
          remoteRev: change.rev,
        },
        { now: ctx.now(), newId: ctx.newId }
      )
      if (row) await table.put({ ...row, syncState: "conflict" })
      return "conflict"
    }
  }

  // 5. plain server state
  await writeServerState(change, def, ctx, tomb !== undefined)
  return "applied"
}

/** Tables a transaction applying these changes needs. */
export function tablesForApply(
  db: VScoutDB,
  changes: ReadonlyArray<DomainChange>
) {
  return [
    ...tablesFor(db, [...new Set(changes.map((c) => c.entity))]),
    db.tombstones,
    db.conflicts,
    db.outbox,
  ]
}

/** Apply a batch (an MQTT burst or a delta page) in ONE transaction. */
export async function applyChanges(
  changes: ReadonlyArray<DomainChange>,
  ctx: ApplyCtx
): Promise<Array<ApplyResult>> {
  if (changes.length === 0) return []
  return ctx.db.transaction("rw", tablesForApply(ctx.db, changes), async () => {
    const results: Array<ApplyResult> = []
    for (const c of changes) results.push(await applyChange(c, ctx))
    return results
  })
}

export function logApplyResults(
  results: ReadonlyArray<ApplyResult>,
  source: string
): void {
  const conflicts = results.filter((r) => r === "conflict").length
  if (conflicts > 0)
    logger.warn("sync", `${conflicts} conflict(s) from ${source}`)
}
