// Client writes to author-owned collections (REQUIREMENTS §7.3): create, update, delete, restore.
// Server fields (authorId, createdAt, updatedAt, rev) always come from here, never the client.
import { iso } from "../lib/clock.js"
import { uuidv7 } from "../lib/ids.js"
import { isPlainObject } from "../lib/json.js"
import { problem, zodErrors } from "../lib/problem.js"
import type { Bus } from "./bus.js"
import { COLLECTION_ENTITY, OWNED } from "./entities.js"
import type { EntityName, OwnedEntityDef, Rec } from "./entities.js"
import type { GameRegistry } from "./games.js"
import { dmParticipants } from "./routing.js"
import type { Viewer } from "./routing.js"
import type { Store } from "./store.js"
import type { Users } from "./users.js"

export const RESTORE_WINDOW_MS = 30 * 86_400_000

export interface Actor extends Viewer {
  role: "admin" | "scouter" | "guest"
  /** guests: the one event their code opened */
  eventKey?: string | undefined
}

const SERVER_FIELDS = ["rev", "authorId", "createdAt", "updatedAt", "updatedBy", "eventKey"]

function strip(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body }
  for (const f of SERVER_FIELDS) delete out[f]
  return out
}

export function entityForCollection(collection: string): EntityName {
  const e = COLLECTION_ENTITY[collection]
  if (!e) throw problem(404, "not_found", { detail: `Unknown collection ${collection}` })
  return e
}

export class Writes {
  constructor(
    private store: Store,
    private users: Users,
    private games: GameRegistry,
    private bus: Bus
  ) {}

  private def(collection: string): OwnedEntityDef {
    const d = OWNED[collection]
    if (!d) throw problem(404, "not_found", { detail: `Unknown collection ${collection}` })
    return d
  }

  private validate(def: OwnedEntityDef, rec: Record<string, unknown>): Rec {
    const parsed = def.schema.safeParse(rec)
    if (!parsed.success) throw problem(422, "validation_failed", { errors: zodErrors(parsed.error.issues) })
    if (def.game) this.games.check(def.entity, parsed.data)
    return parsed.data as Rec
  }

  /** Rules that depend on other records or on the caller (beyond the schema). */
  private checkRelations(def: OwnedEntityDef, rec: Rec, actor: Actor, before?: Rec) {
    switch (def.entity) {
      case "message": {
        const ch = String(rec.channelId)
        const dm = dmParticipants(ch)
        if (dm) {
          if (rec.kind !== "message")
            throw problem(422, "validation_failed", { errors: [{ path: "kind", code: "invalid_value", message: "DMs carry messages only" }] })
          if (dm[0] === dm[1] || !dm.includes(String(rec.authorId)))
            throw problem(403, "forbidden", { detail: "Not a participant of this DM" })
          const other = dm[0] === rec.authorId ? dm[1] : dm[0]
          if (!this.users.byId(other))
            throw problem(422, "validation_failed", { errors: [{ path: "channelId", code: "unknown_user" }] })
        } else if (ch !== `event:${String(rec.eventKey)}`) {
          throw problem(422, "validation_failed", { errors: [{ path: "channelId", code: "channel_mismatch", message: "Channel must be this event's" }] })
        }
        if ((rec.kind === "announcement" || rec.priority === "urgent") && actor.role !== "admin") {
          // an edit that keeps an existing admin's announcement as is stays allowed for its author
          if (!before || before.kind !== rec.kind || before.priority !== rec.priority)
            throw problem(403, "role_required", { detail: "Announcements and urgent messages are admin-only" })
        }
        if (rec.replyToId) {
          const parent = this.store.live("message", String(rec.replyToId))
          if (parent && parent.channelId !== rec.channelId)
            throw problem(422, "validation_failed", { errors: [{ path: "replyToId", code: "channel_mismatch" }] })
        }
        break
      }
      case "reaction": {
        const target = this.store.live("message", String(rec.targetId))
        if (!target || target.eventKey !== rec.eventKey)
          throw problem(422, "validation_failed", { errors: [{ path: "targetId", code: "unknown_target" }] })
        const isAnnouncement = target.kind === "announcement"
        if ((rec.targetType === "announcement") !== isAnnouncement)
          throw problem(422, "validation_failed", { errors: [{ path: "targetType", code: "target_mismatch" }] })
        if (actor.role === "guest" && !isAnnouncement) throw problem(403, "role_required")
        const dm = dmParticipants(String(target.channelId))
        if (dm && !dm.includes(actor.id)) throw problem(403, "forbidden")
        break
      }
      case "picklist": {
        // only admins create master lists or change the flag (ADR-080)
        if (actor.role !== "admin" && (rec.master === true) !== (before?.master === true))
          throw problem(403, "forbidden", { detail: "Only admins manage master picklists" })
        break
      }
      case "picklistEntry": {
        const list = this.store.live("picklist", String(rec.picklistId))
        if (!list || list.eventKey !== rec.eventKey)
          throw problem(422, "validation_failed", { errors: [{ path: "picklistId", code: "unknown_picklist" }] })
        if (actor.role !== "admin" && list.authorId !== actor.id) throw problem(403, "not_author")
        break
      }
      case "pitScouting": {
        const photos = Array.isArray(rec.photos) ? (rec.photos as string[]) : []
        const missing = photos.filter((p) => !this.store.live("mediaAsset", p))
        if (missing.length)
          throw problem(422, "media_missing", {
            errors: missing.map((id) => ({ path: "photos", code: "media_missing", message: id })),
          })
        break
      }
      case "comment": {
        if (rec.parentId) {
          const parent = this.store.live("comment", String(rec.parentId))
          if (parent && parent.eventKey !== rec.eventKey)
            throw problem(422, "validation_failed", { errors: [{ path: "parentId", code: "unknown_parent" }] })
        }
        break
      }
    }
  }

  /** Can the actor see this record at all? (keeps DMs and private notes from leaking via 409s) */
  private visible(entity: EntityName, rec: Rec, actor: Actor): boolean {
    if (entity === "comment" && rec.visibility === "private") return rec.authorId === actor.id
    if (entity === "message") {
      const dm = dmParticipants(String(rec.channelId))
      if (dm) return dm.includes(actor.id)
      if (rec.kind === "message" && actor.role === "guest") return false
    }
    if (entity === "reaction") {
      const t = this.store.get("message", String(rec.targetId))?.data
      if (t) return this.visible("message", t, actor)
    }
    return true
  }

  private requireEvent(eventKey: string, actor: Actor) {
    if (actor.role === "guest" && actor.eventKey !== eventKey) throw problem(403, "guest_access_disabled")
    if (!this.store.live("event", eventKey)) throw problem(404, "not_found", { detail: `Unknown event ${eventKey}`, current: null })
  }

  create(collection: string, eventKey: string, body: unknown, actor: Actor, opId?: string): Rec {
    const def = this.def(collection)
    if (!isPlainObject(body)) throw problem(400, "validation_failed", { detail: "JSON object expected" })
    if (actor.role === "guest" && !(def.entity === "reaction" && body.targetType === "announcement"))
      throw problem(403, "role_required")
    this.requireEvent(eventKey, actor)
    const id = typeof body.id === "string" ? body.id : ""
    if (!id || id.length > 64)
      throw problem(422, "validation_failed", { errors: [{ path: "id", code: "required", message: "Client id required" }] })

    return this.store.tx(() => {
      const existing = this.store.get(def.entity, id)
      if (existing?.deleted) throw problem(409, "deleted", { current: null })
      if (existing)
        throw problem(409, "already_exists", {
          current: this.visible(def.entity, existing.data, actor) ? existing.data : null,
        })
      const now = iso(this.store.now())
      const candidate: Record<string, unknown> = {
        ...strip(body),
        id,
        rev: 1,
        eventKey,
        authorId: actor.id,
        createdAt: now,
        updatedAt: now,
      }
      if (def.entity === "picklist" && candidate.ownerId === undefined) candidate.ownerId = actor.id
      const rec = this.validate(def, candidate)
      if (def.entity === "picklist") rec.ownerId = actor.id
      this.checkRelations(def, rec, actor)
      const naturalKey = def.naturalKey?.(rec) ?? null
      if (naturalKey) {
        const dup = this.store.byNaturalKey(def.entity, naturalKey)
        if (dup) throw problem(409, "duplicate", { current: this.visible(def.entity, dup.data, actor) ? dup.data : null })
      }
      this.store.put(def.entity, rec, { actorId: actor.id, opId, naturalKey })
      if (def.entity === "message") this.store.db.afterCommit(() => this.bus.emit("messageCreated", rec))
      return rec
    })
  }

  private loadForChange(entity: EntityName, id: string, actor: Actor) {
    const current = this.store.get(entity, id)
    if (!current) throw problem(404, "not_found", { current: null })
    if (!this.visible(entity, current.data, actor)) throw problem(404, "not_found", { current: null })
    if (actor.role === "guest" && current.eventKey && current.eventKey !== actor.eventKey)
      throw problem(403, "guest_access_disabled")
    return current
  }

  /** Author or admin; DMs and private notes are never moderated by admins. */
  private mayChange(entity: EntityName, rec: Rec, actor: Actor): boolean {
    if (rec.authorId === actor.id) return true
    if (actor.role !== "admin") {
      // a picklist's owner manages the entries in it
      if (entity === "picklistEntry") return this.store.live("picklist", String(rec.picklistId))?.authorId === actor.id
      return false
    }
    if (entity === "comment" && rec.visibility === "private") return false
    if (entity === "message" && dmParticipants(String(rec.channelId))) return false
    if (entity === "reaction") {
      const t = this.store.get("message", String(rec.targetId))?.data
      if (t && dmParticipants(String(t.channelId))) return false
    }
    return true
  }

  update(collection: string, id: string, body: unknown, actor: Actor, opId?: string): Rec {
    const def = this.def(collection)
    if (actor.role === "guest") throw problem(403, "role_required")
    if (!isPlainObject(body) || !isPlainObject(body.record))
      throw problem(400, "validation_failed", { errors: [{ path: "record", code: "required" }] })
    const baseRev = Number(body.baseRev)
    if (!Number.isInteger(baseRev))
      throw problem(400, "validation_failed", { errors: [{ path: "baseRev", code: "required" }] })
    if (def.entity === "reaction") throw problem(422, "validation_failed", { detail: "Reactions can't be edited; delete and create" })
    const record = body.record

    return this.store.tx(() => {
      const current = this.loadForChange(def.entity, id, actor)
      if (current.deleted) throw problem(409, "deleted", { current: null })
      if (!this.mayChange(def.entity, current.data, actor)) throw problem(403, "not_author")
      if (baseRev !== current.rev) throw problem(409, "rev_conflict", { current: current.data })
      for (const f of def.immutable) {
        if (f in record && JSON.stringify(record[f]) !== JSON.stringify(current.data[f]))
          throw problem(422, "validation_failed", { errors: [{ path: `record.${f}`, code: "immutable" }] })
      }
      const candidate: Record<string, unknown> = {
        ...strip(record),
        id,
        rev: current.rev + 1,
        eventKey: current.data.eventKey,
        authorId: current.data.authorId,
        createdAt: current.data.createdAt,
        updatedAt: iso(this.store.now()),
      }
      for (const f of def.immutable) if (!(f in record)) candidate[f] = current.data[f]
      if (def.entity === "picklist") candidate.ownerId = current.data.ownerId ?? current.data.authorId
      if (actor.id !== current.data.authorId) candidate.updatedBy = actor.id
      const rec = this.validate(def, candidate)
      this.checkRelations(def, rec, actor, current.data)
      const naturalKey = def.naturalKey?.(rec) ?? null
      if (naturalKey) {
        const dup = this.store.byNaturalKey(def.entity, naturalKey)
        if (dup && dup.id !== id) throw problem(409, "duplicate", { current: dup.data })
      }
      this.store.put(def.entity, rec, { actorId: actor.id, opId, naturalKey })
      if (actor.id !== current.data.authorId) this.audit(actor, "update", def.entity, rec, null)
      return rec
    })
  }

  remove(
    collection: string,
    id: string,
    baseRevRaw: unknown,
    actor: Actor,
    opId?: string,
    reason?: string | null
  ): { id: string; rev: number; deletedAt: string } {
    const entity = entityForCollection(collection)
    const baseRev = Number(baseRevRaw)
    if (baseRevRaw === undefined || baseRevRaw === null || baseRevRaw === "" || !Number.isInteger(baseRev))
      throw problem(400, "validation_failed", { errors: [{ path: "baseRev", code: "required" }] })
    return this.store.tx(() => {
      const current = this.loadForChange(entity, id, actor)
      if (current.deleted) throw problem(409, "deleted", { current: null })
      if (actor.role === "guest") {
        const own = entity === "reaction" && current.data.authorId === actor.id
        if (!own) throw problem(403, "role_required")
      }
      if (!this.mayChange(entity, current.data, actor)) throw problem(403, "not_author")
      if (baseRev !== current.rev) throw problem(409, "rev_conflict", { current: current.data })
      const rev = current.rev + 1
      const env = this.store.remove(entity, current.data, rev, { actorId: actor.id, opId })
      if (current.data.authorId !== actor.id) this.audit(actor, "delete", entity, current.data, reason ?? null)
      return { id, rev, deletedAt: env.ts }
    })
  }

  restore(collection: string, id: string, body: unknown, actor: Actor, opId?: string): Rec {
    const entity = entityForCollection(collection)
    if (actor.role === "guest") throw problem(403, "role_required")
    const baseRev = isPlainObject(body) ? Number(body.baseRev) : NaN
    if (!Number.isInteger(baseRev)) throw problem(400, "validation_failed", { errors: [{ path: "baseRev", code: "required" }] })
    return this.store.tx(() => {
      const current = this.loadForChange(entity, id, actor)
      if (!current.deleted) throw problem(409, "rev_conflict", { current: current.data })
      if (!this.mayChange(entity, current.data, actor)) throw problem(403, "not_author")
      if ((current.deletedAt ?? 0) < this.store.now() - RESTORE_WINDOW_MS) throw problem(404, "not_found", { current: null })
      if (baseRev !== current.rev) throw problem(409, "rev_conflict", { current: null })
      const def = OWNED[collection]
      const rec: Rec = { ...current.data, rev: current.rev + 1, updatedAt: iso(this.store.now()) }
      if (actor.id !== rec.authorId) rec.updatedBy = actor.id
      const naturalKey = def?.naturalKey?.(rec) ?? null
      if (naturalKey) {
        const dup = this.store.byNaturalKey(entity, naturalKey)
        if (dup) throw problem(409, "duplicate", { current: dup.data })
      }
      if (entity === "reaction" || entity === "picklistEntry") {
        // their target must still exist
        const parent =
          entity === "reaction"
            ? this.store.live("message", String(rec.targetId))
            : this.store.live("picklist", String(rec.picklistId))
        if (!parent) throw problem(409, "deleted", { current: null, detail: "The record it belongs to is gone" })
      }
      this.store.put(entity, rec, { actorId: actor.id, opId, naturalKey })
      if (actor.id !== rec.authorId) this.audit(actor, "restore", entity, rec, null)
      return rec
    })
  }

  private audit(actor: Actor, action: string, entity: EntityName, rec: Rec, reason: string | null) {
    this.store.db.run(
      "INSERT INTO audit (id, event_key, at, actor_id, action, entity, record_id, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      uuidv7(this.store.now()),
      String(rec.eventKey ?? ""),
      this.store.now(),
      actor.id,
      action,
      entity,
      rec.id,
      reason
    )
  }
}
