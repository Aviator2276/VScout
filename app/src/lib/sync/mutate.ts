// The write API features use (data-layer §8.1). Each call is ONE transaction over
// [entity table, outbox, tombstones(, drafts)]: validate → record (pending) → outbox op.
// The push path (Phase 1 track 5) sends the ops; features never touch the outbox.
import type { Table } from "dexie"
import type { z } from "zod"
import { ENTITY_SCHEMAS } from "@/lib/contracts/entities"
import type { Clock } from "@/lib/clock"
import type { DomainRecords, OwnedMeta } from "@/lib/db/types"
import type { IdGen } from "@/lib/ids"
import type { VScoutDB } from "@/lib/db/schema"
import { deriveFormSchema } from "@/games/kit/schema"
import { formOf, stageOfMatchKey } from "@/games/kit/fields"
import { ENTITY_DEFS } from "./entity-registry"
import type { OwnedEntity } from "./entity-registry"
import { NotAllowedError, RecordNotFoundError, ValidationError } from "./errors"
import type { GameLookup } from "./game-payload"
import { enqueue, opsFor } from "./outbox"

export type WriteAction = "create" | "update" | "delete"

export interface MutateDeps {
  db: VScoutDB
  clock: Clock
  ids: IdGen
  games: GameLookup
  /** the signed-in user; writes need one */
  session: () => { userId: string } | null
  /** client RBAC, UX only (lib/authorization.ts, track 7); the server re-checks */
  authorize?: (
    action: WriteAction,
    entity: OwnedEntity,
    record: unknown
  ) => boolean
  /** after commit: ask the engine to push (track 5) */
  onWrite?: () => void
}

type Rec<TEntity extends OwnedEntity> = DomainRecords[TEntity]
/** What a feature provides on create: the domain fields, without server/local meta. */
export type CreateInput<TEntity extends OwnedEntity> = Omit<
  Rec<TEntity>,
  keyof OwnedMeta
> & { eventKey: string }

const META_KEYS = {
  id: true,
  rev: true,
  updatedAt: true,
  createdAt: true,
  eventKey: true,
  authorId: true,
  updatedBy: true,
} as const
const LOCAL_KEYS = new Set(["syncState", "localUpdatedAt", "unsupported"])

function tableOf<TEntity extends OwnedEntity>(db: VScoutDB, entity: TEntity) {
  return db.table(ENTITY_DEFS[entity].table) as unknown as Table<
    Rec<TEntity>,
    string
  >
}

/** Validates the domain fields with the wire schema (minus meta) and the game form. */
function validate(
  entity: OwnedEntity,
  record: Record<string, unknown>,
  games: GameLookup
): void {
  const fields = Object.fromEntries(
    Object.entries(record).filter(([k]) => !LOCAL_KEYS.has(k))
  )
  // every owned schema spreads wireOwnedMeta, so all meta keys exist on each shape
  const schema = ENTITY_SCHEMAS[entity] as unknown as z.ZodObject<
    Record<keyof typeof META_KEYS, z.ZodType>
  >
  const core = schema.omit(META_KEYS).safeParse(fields)
  if (!core.success)
    throw new ValidationError(`Invalid ${entity}`, core.error.issues)

  const form = ENTITY_DEFS[entity].gameForm
  if (!form) return
  const gameId = String(record.gameId)
  const game = games(gameId)
  if (!game) throw new ValidationError(`Unknown game ${gameId}`, [])
  const level = record.scouterLevel === "new" ? "new" : "experienced"
  const data = deriveFormSchema(game, formOf(game, form), {
    level,
    stage: stageOfMatchKey(record.matchKey),
  }).safeParse(record.data)
  if (!data.success)
    throw new ValidationError(`Invalid ${entity} data`, data.error.issues)
}

function requireUser(deps: MutateDeps): string {
  const s = deps.session()
  if (!s) throw new NotAllowedError("Sign in to make changes")
  return s.userId
}

function checkAllowed(
  deps: MutateDeps,
  action: WriteAction,
  entity: OwnedEntity,
  record: unknown
) {
  if (deps.authorize && !deps.authorize(action, entity, record))
    throw new NotAllowedError(`Not allowed to ${action} ${entity}`)
}

export async function createRecord<TEntity extends OwnedEntity>(
  deps: MutateDeps,
  entity: TEntity,
  input: CreateInput<TEntity>,
  opts: { id?: string; dependsOn?: Array<string>; fromDraftId?: string } = {}
): Promise<Rec<TEntity>> {
  const userId = requireUser(deps)
  const now = deps.clock.now()
  const record = {
    ...input,
    id: opts.id ?? opts.fromDraftId ?? deps.ids.newId(),
    rev: 0,
    updatedAt: now,
    createdAt: now,
    authorId: userId,
    syncState: "pending",
    localUpdatedAt: now,
  } as unknown as Rec<TEntity>
  checkAllowed(deps, "create", entity, record)
  validate(entity, record, deps.games)

  const { db } = deps
  await db.transaction(
    "rw",
    [tableOf(db, entity), db.outbox, db.tombstones, db.drafts],
    async () => {
      await tableOf(db, entity).add(record)
      await enqueue(db, {
        opId: deps.ids.newId(),
        userId,
        entity,
        recordId: record.id,
        eventKey: record.eventKey,
        kind: "create",
        ...(opts.dependsOn ? { dependsOn: opts.dependsOn } : {}),
        now,
      })
      // a submitted form's draft goes in the same transaction: all or nothing (data-layer §12)
      if (opts.fromDraftId) await db.drafts.delete(opts.fromDraftId)
    }
  )
  deps.onWrite?.()
  return record
}

export async function updateRecord<TEntity extends OwnedEntity>(
  deps: MutateDeps,
  entity: TEntity,
  id: string,
  patch: (current: Rec<TEntity>) => Rec<TEntity>
): Promise<Rec<TEntity>> {
  const userId = requireUser(deps)
  const { db } = deps
  const table = tableOf(db, entity)
  let result: Rec<TEntity> | undefined
  await db.transaction("rw", [table, db.outbox, db.conflicts], async () => {
    const current = await table.get(id)
    if (!current) throw new RecordNotFoundError(entity, id)
    const now = deps.clock.now()
    const next = {
      ...patch(current),
      id: current.id,
      rev: current.rev,
      authorId: current.authorId,
      createdAt: current.createdAt,
      eventKey: current.eventKey,
      updatedAt: now,
      localUpdatedAt: now,
      syncState: "pending",
    } as Rec<TEntity>
    checkAllowed(deps, "update", entity, next)
    validate(entity, next, deps.games)

    // "edit and retry" after a rejection: drop the stuck ops and resolve the conflict
    let kind: "create" | "update" = "update"
    if (current.syncState === "rejected" || current.syncState === "conflict") {
      const stuck = (await opsFor(db, entity, id)).filter(
        (o) => o.state === "blocked" || o.state === "failed"
      )
      await db.outbox.bulkDelete(
        stuck.flatMap((o) => (o.seq === undefined ? [] : [o.seq]))
      )
      await db.conflicts
        .where("[entity+recordId]")
        .equals([entity, id])
        .modify({ status: "resolved", resolvedAt: now })
      if (current.rev === 0) kind = "create" // the server never accepted it
    }
    await table.put(next)
    await enqueue(db, {
      opId: deps.ids.newId(),
      userId,
      entity,
      recordId: id,
      eventKey: next.eventKey,
      kind,
      now,
    })
    result = next
  })
  deps.onWrite?.()
  return result as unknown as Rec<TEntity>
}

export async function deleteRecord<TEntity extends OwnedEntity>(
  deps: MutateDeps,
  entity: TEntity,
  id: string
): Promise<void> {
  const userId = requireUser(deps)
  const { db } = deps
  const table = tableOf(db, entity)
  await db.transaction("rw", [table, db.outbox, db.tombstones], async () => {
    const current = await table.get(id)
    if (!current) throw new RecordNotFoundError(entity, id)
    checkAllowed(deps, "delete", entity, current)
    const now = deps.clock.now()
    const result = await enqueue(db, {
      opId: deps.ids.newId(),
      userId,
      entity,
      recordId: id,
      eventKey: current.eventKey,
      kind: "delete",
      now,
    })
    await table.delete(id)
    if (result === "dropped-create") return // the server never saw it: nothing to tombstone
    await db.tombstones.put({
      entity,
      id,
      rev: current.rev,
      deletedAt: now,
      eventKey: current.eventKey,
      syncState: "pending",
      snapshot: current,
    })
  })
  deps.onWrite?.()
}
