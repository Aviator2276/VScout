// Changes not uploaded yet, for the Sync sheet's "Waiting to Upload" (features/sync-status.md S3):
// what each one is ("Note · Q12 · 254") and its status.
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { useLiveOr } from "@/lib/db/react/data-state-hooks"
import type { OutboxOp } from "@/lib/db/types"
import type { EntityName } from "@/lib/contracts/entities"
import { entityName } from "@/lib/sync/conflict-view"
import { ENTITY_DEFS } from "@/lib/sync/entity-registry"
import { parseMatchKey, shortMatchLabel } from "@/utils/match-label"

export interface WaitingOp {
  op: OutboxOp
  /** "Match scouting · Q12 · 254" */
  title: string
}

const KIND_VERB: Record<OutboxOp["kind"], string> = {
  create: "",
  update: "Edit to ",
  delete: "Delete ",
  upload: "",
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function titleFor(
  op: Pick<OutboxOp, "entity" | "kind">,
  record: { teamNumber?: unknown; matchKey?: unknown } | undefined
): string {
  const what =
    op.kind === "upload"
      ? "Photo upload"
      : capitalize(`${KIND_VERB[op.kind]}${entityName(op.entity)}`)
  const match =
    typeof record?.matchKey === "string" ? parseMatchKey(record.matchKey) : null
  return [
    what,
    match ? shortMatchLabel(match) : null,
    typeof record?.teamNumber === "number" ? String(record.teamNumber) : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

/** "Uploading…", "Waiting for photo", "Retrying in 12 s", "Waiting" */
export function opStatus(op: OutboxOp, now: number): string {
  if (op.state === "inflight") return "Uploading…"
  if (op.state === "blocked")
    return op.dependsOn?.length ? "Waiting for photo" : "Waiting"
  if (op.state === "failed") return "Not saved"
  const wait = Math.ceil((op.nextAttemptAt - now) / 1000)
  return op.attempts > 0 && wait > 0 ? `Retrying in ${wait} s` : "Waiting"
}

export function useWaitingOps(): ReadonlyArray<WaitingOp> {
  const { db } = useDataRuntime()
  return useLiveOr(
    async () => {
      const ops = await db.outbox
        .where("state")
        .anyOf("queued", "inflight", "blocked")
        .sortBy("createdAt")
      return Promise.all(
        ops.map(async (op) => {
          const def = ENTITY_DEFS[op.entity as EntityName] as
            (typeof ENTITY_DEFS)[EntityName] | undefined
          const record = def
            ? ((await db.table(def.table).get(def.key(op.recordId))) as
                { teamNumber?: unknown; matchKey?: unknown } | undefined)
            : undefined
          return { op, title: titleFor(op, record) }
        })
      )
    },
    [db],
    []
  )
}
