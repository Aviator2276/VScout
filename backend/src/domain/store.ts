// Records and the change log (REQUIREMENTS §6). Every committed revision is appended to the log
// for each of its targets; listeners (MQTT, SSE, push) get the batch only after commit.
import type { Db } from "../db/db.js"
import type { Clock } from "../lib/clock.js"
import { iso } from "../lib/clock.js"
import type { EntityName, Rec } from "./entities.js"
import { lostTargets, targetsFor } from "./routing.js"
import type { LogTarget } from "./routing.js"

export interface Envelope {
  v: 1
  entity: EntityName
  op: "upsert" | "delete"
  id: string
  rev: number
  eventKey: string | null
  ts: string
  actorId?: string
  opId?: string
  data?: Rec
}

export interface CommittedChange {
  envelope: Envelope
  targets: LogTarget[]
}

export type ChangeSource = "client" | "import" | "system"

export interface CommittedBatch {
  source: ChangeSource
  changes: CommittedChange[]
  /** the writer's record before this change (push triggers compare) */
  meta?: Record<string, unknown>
}

export interface StoredRecord {
  entity: EntityName
  id: string
  rev: number
  deleted: boolean
  eventKey: string | null
  authorId: string | null
  data: Rec
  contentHash: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

interface RecordRow {
  entity: string
  id: string
  event_key: string | null
  author_id: string | null
  rev: number
  deleted: number
  natural_key: string | null
  content_hash: string | null
  data: string
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export interface WriteOpts {
  actorId?: string | undefined
  opId?: string | undefined
  naturalKey?: string | null | undefined
  contentHash?: string | null | undefined
  source?: ChangeSource
}

type Listener = (batch: CommittedBatch) => void

export class Store {
  private listeners = new Set<Listener>()
  private batch: CommittedBatch | null = null

  constructor(
    readonly db: Db,
    readonly clock: Clock
  ) {}

  onCommit(l: Listener): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  now(): number {
    return this.clock.now()
  }

  get(entity: EntityName, id: string): StoredRecord | undefined {
    const row = this.db.get<RecordRow>("SELECT * FROM records WHERE entity = ? AND id = ?", entity, id)
    return row ? toStored(row) : undefined
  }

  /** A live record, or undefined when missing or deleted. */
  live(entity: EntityName, id: string): Rec | undefined {
    const r = this.get(entity, id)
    return r && !r.deleted ? r.data : undefined
  }

  byNaturalKey(entity: EntityName, naturalKey: string): StoredRecord | undefined {
    const row = this.db.get<RecordRow>(
      "SELECT * FROM records WHERE entity = ? AND natural_key = ? AND deleted = 0",
      entity,
      naturalKey
    )
    return row ? toStored(row) : undefined
  }

  listLive(entity: EntityName, eventKey?: string): Rec[] {
    const rows =
      eventKey === undefined
        ? this.db.all<RecordRow>("SELECT * FROM records WHERE entity = ? AND deleted = 0", entity)
        : this.db.all<RecordRow>(
            "SELECT * FROM records WHERE entity = ? AND event_key = ? AND deleted = 0",
            entity,
            eventKey
          )
    return rows.map((r) => JSON.parse(r.data) as Rec)
  }

  private lookupMessage = (id: string) => this.get("message", id)?.data

  targets(entity: EntityName, rec: Rec): LogTarget[] {
    return targetsFor(entity, rec, this.lookupMessage)
  }

  /**
   * Stores `rec` (which already carries its new rev and timestamps) and appends its upsert
   * envelope. Must run inside db.tx().
   */
  put(entity: EntityName, rec: Rec, opts: WriteOpts = {}): Envelope {
    const before = this.get(entity, rec.id)
    const now = Date.parse(String(rec.updatedAt ?? "")) || this.now()
    const createdAt = Date.parse(String(rec.createdAt ?? "")) || before?.createdAt || now
    const eventKey = typeof rec.eventKey === "string" ? rec.eventKey : null
    const authorId = typeof rec.authorId === "string" ? rec.authorId : null
    this.db.run(
      `INSERT INTO records (entity, id, event_key, author_id, rev, deleted, natural_key, content_hash, data, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(entity, id) DO UPDATE SET event_key = excluded.event_key, author_id = excluded.author_id,
         rev = excluded.rev, deleted = 0, natural_key = excluded.natural_key, content_hash = excluded.content_hash,
         data = excluded.data, updated_at = excluded.updated_at, deleted_at = NULL`,
      entity,
      rec.id,
      eventKey,
      authorId,
      rec.rev,
      opts.naturalKey ?? null,
      opts.contentHash ?? null,
      JSON.stringify(rec),
      createdAt,
      now
    )
    const env = this.envelope(entity, "upsert", rec, opts)
    const targets = this.targets(entity, rec)
    if (before && !before.deleted) {
      for (const t of lostTargets(this.targets(entity, before.data), targets))
        this.appendRow({ ...env, op: "delete", data: undefined }, t)
    }
    this.append(env, targets, opts.source ?? "client")
    return env
  }

  /** Marks the record deleted at `rev` and appends the delete envelope. Must run inside db.tx(). */
  remove(entity: EntityName, current: Rec, rev: number, opts: WriteOpts = {}): Envelope {
    const now = this.now()
    const targets = this.targets(entity, current)
    this.db.run(
      `UPDATE records SET rev = ?, deleted = 1, updated_at = ?, deleted_at = ? WHERE entity = ? AND id = ?`,
      rev,
      now,
      now,
      entity,
      current.id
    )
    const env = this.envelope(entity, "delete", { ...current, rev, updatedAt: iso(now) }, opts)
    this.append(env, targets, opts.source ?? "client")
    return env
  }

  private envelope(entity: EntityName, op: "upsert" | "delete", rec: Rec, opts: WriteOpts): Envelope {
    return {
      v: 1,
      entity,
      op,
      id: rec.id,
      rev: rec.rev,
      eventKey: typeof rec.eventKey === "string" && entity !== "userSettings" ? rec.eventKey : null,
      ts: String(rec.updatedAt ?? iso(this.now())),
      ...(opts.actorId ? { actorId: opts.actorId } : {}),
      ...(opts.opId ? { opId: opts.opId } : {}),
      ...(op === "upsert" ? { data: rec } : {}),
    }
  }

  private appendRow(env: Envelope, t: LogTarget) {
    this.db.run(
      `INSERT INTO change_log (scope, entity, record_id, rev, op, audience, exclude_user, envelope, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.scope,
      env.entity,
      env.id,
      env.rev,
      env.op,
      t.audience,
      t.excludeUser ?? null,
      JSON.stringify(env),
      this.now()
    )
    this.queue({ envelope: env, targets: [t] })
  }

  private append(env: Envelope, targets: LogTarget[], source: ChangeSource) {
    for (const t of targets) this.appendRow(env, t)
    if (this.batch && source !== "client") this.batch.source = source
  }

  /** A write transaction; the batch is dropped if it rolls back. */
  tx<T>(fn: () => T, meta?: Record<string, unknown>): T {
    try {
      return this.db.tx(() => {
        const result = fn()
        if (this.batch && meta) this.batch.meta = { ...this.batch.meta, ...meta }
        return result
      })
    } catch (e) {
      this.batch = null
      throw e
    }
  }

  private queue(change: CommittedChange) {
    if (!this.batch) {
      const batch: CommittedBatch = { source: "client", changes: [] }
      this.batch = batch
      this.db.afterCommit(() => {
        this.batch = null
        for (const l of this.listeners) l(batch)
      })
    }
    // merge targets of the same envelope so listeners see one change per revision
    const last = this.batch.changes.at(-1)
    if (last && last.envelope === change.envelope) last.targets.push(...change.targets)
    else this.batch.changes.push(change)
  }

  /** Current log position (the bootstrap snapshot point). */
  head(): number {
    return this.db.get<{ seq: number | null }>("SELECT MAX(seq) AS seq FROM change_log")?.seq ?? 0
  }
}

function toStored(row: RecordRow): StoredRecord {
  return {
    entity: row.entity as EntityName,
    id: row.id,
    rev: row.rev,
    deleted: row.deleted === 1,
    eventKey: row.event_key,
    authorId: row.author_id,
    data: JSON.parse(row.data) as Rec,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}
