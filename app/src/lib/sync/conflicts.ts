// Resolving conflicts (data-layer §11). Whole-record choices only: keep mine, keep theirs, discard.
import type { Table } from "dexie"
import type { VScoutDB } from "@/lib/db/schema"
import type { ConflictRow } from "@/lib/db/types"
import { ENTITY_DEFS } from "./entity-registry"
import { enqueue } from "./outbox"
import type { EntityName } from "@/lib/contracts/entities"

type Row = Record<string, unknown> & {
  id: string
  rev: number
  eventKey?: string | null
}

export interface ResolveDeps {
  db: VScoutDB
  now: () => number
  newId: () => string
  session: () => { userId: string } | null
  onWrite?: () => void
}

export type Resolution = "keep-mine" | "keep-theirs" | "discard"

function tableOf(db: VScoutDB, entity: string) {
  return db.table(ENTITY_DEFS[entity as EntityName].table) as unknown as Table<
    Row,
    string | number
  >
}

export async function resolveConflict(
  deps: ResolveDeps,
  conflictId: string,
  choice: Resolution
): Promise<void> {
  const { db } = deps
  const conflict = await db.conflicts.get(conflictId)
  if (!conflict || conflict.status !== "open") return
  const table = tableOf(db, conflict.entity)
  const def = ENTITY_DEFS[conflict.entity as EntityName]
  const now = deps.now()

  await db.transaction(
    "rw",
    [table, db.outbox, db.conflicts, db.tombstones],
    async () => {
      await db.outbox.where("opId").anyOf(conflict.blockedOpIds).delete()
      const local = conflict.local as Row | null
      const remote = conflict.remote as Row | null

      if (choice === "keep-mine" && local) {
        const userId = deps.session()?.userId
        if (!userId) throw new Error("Sign in to keep your version")
        // duplicate: my values go onto the record the server already has (same natural key)
        const targetId =
          conflict.kind === "duplicate" && remote ? remote.id : local.id
        if (targetId !== local.id) await table.delete(def.key(local.id))
        const rev = conflict.remoteRev ?? local.rev
        await table.put({
          ...local,
          id: targetId,
          rev,
          syncState: "pending",
          localUpdatedAt: now,
        })
        await db.tombstones.delete([conflict.entity, targetId])
        await enqueue(db, {
          opId: deps.newId(),
          userId,
          entity: conflict.entity,
          recordId: targetId,
          eventKey: conflict.eventKey,
          kind: remote === null && rev === 0 ? "create" : "update",
          now,
        })
      } else {
        // keep-theirs / discard: back to the server's version (or gone if it has none)
        if (conflict.kind === "duplicate" && local)
          await table.delete(def.key(local.id))
        if (remote) {
          await table.put({
            ...remote,
            syncState: "synced",
            localUpdatedAt: now,
          })
        } else if (local) {
          await table.delete(def.key(local.id))
          if (conflict.remoteRev !== null)
            await db.tombstones.put({
              entity: conflict.entity,
              id: local.id,
              rev: conflict.remoteRev,
              deletedAt: now,
              eventKey: conflict.eventKey,
              syncState: "synced",
            })
        }
      }
      const resolved: Partial<ConflictRow> = {
        status: "resolved",
        resolvedAt: now,
      }
      await db.conflicts.update(conflictId, resolved)
    }
  )
  if (choice === "keep-mine") deps.onWrite?.()
}
