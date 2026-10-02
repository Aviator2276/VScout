// What the conflict sheet shows (data-layer §11 ConflictView): a title, the changed answers side by
// side with labels from the game module, and the choices that make sense for the conflict kind.
import { allFields, formOf } from "@/games/kit/fields"
import { t } from "@/games/kit/labels"
import type { FieldDef, GameDefinition } from "@/games/types"
import type { ConflictRow } from "@/lib/db/types"
import type { Resolution } from "./conflicts"

export interface ConflictField {
  path: string
  label: string
  mine: string
  theirs: string | null
  changed: boolean
}

export type ConflictAction = Resolution | "edit-and-retry"

export interface ConflictView {
  conflict: ConflictRow
  title: string
  /** one line on what happened */
  summary: string
  fields: Array<ConflictField>
  actions: Array<ConflictAction>
}

type Rec = Record<string, unknown> | null

const FORM_OF: Record<string, "match" | "pit" | "post" | undefined> = {
  scoutEntry: "match",
  pitScouting: "pit",
  postScouting: "post",
}

const CORE_LABELS: Record<string, string> = {
  body: "Text",
  visibility: "Visibility",
  name: "Name",
  emoji: "Reaction",
  teamNumber: "Team",
  matchKey: "Match",
}

function show(
  game: GameDefinition | null,
  field: FieldDef | undefined,
  v: unknown
): string {
  if (v === undefined) return "—"
  if (v === null) return "Didn’t see"
  if (typeof v === "boolean") return v ? "Yes" : "No"
  if (
    game &&
    field &&
    (field.kind === "choice" || field.kind === "multiChoice")
  ) {
    const list = Array.isArray(v) ? v : [v]
    return list
      .map((x) => {
        const o = field.options.find((op) => op.value === x)
        return o ? t(game, o.label) : String(x)
      })
      .join(", ")
  }
  if (Array.isArray(v)) return v.length === 0 ? "None" : `${v.length} items`
  if (typeof v === "object") return "…"
  return typeof v === "string" ? v : String(v)
}

export function entityName(entity: string): string {
  return (
    {
      scoutEntry: "match scouting",
      pitScouting: "pit scouting",
      postScouting: "post-scouting",
      comment: "note",
      message: "message",
      picklist: "picklist",
      picklistEntry: "picklist entry",
      reaction: "reaction",
    }[entity] ?? entity
  )
}

export function buildConflictView(
  conflict: ConflictRow,
  game: GameDefinition | null,
  opts: { matchLabel?: (key: string) => string } = {}
): ConflictView {
  const local = conflict.local as Rec
  const remote = conflict.remote as Rec
  const base = local ?? remote ?? {}
  const team =
    typeof base.teamNumber === "number" ? `Team ${base.teamNumber}` : null
  const match =
    typeof base.matchKey === "string"
      ? (opts.matchLabel?.(base.matchKey) ?? base.matchKey)
      : null
  const title = [team, match, entityName(conflict.entity)]
    .filter(Boolean)
    .join(" · ")

  const fields: Array<ConflictField> = []
  const form = FORM_OF[conflict.entity]
  if (game && form) {
    const mine = (local?.data ?? {}) as Record<string, unknown>
    const theirs = (remote?.data ?? null) as Record<string, unknown> | null
    for (const f of allFields(formOf(game, form))) {
      const a = mine[f.id]
      const b = theirs ? theirs[f.id] : undefined
      if (a === undefined && b === undefined) continue
      fields.push({
        path: `data.${f.id}`,
        label: t(game, f.label),
        mine: show(game, f, a),
        theirs: theirs ? show(game, f, b) : null,
        changed: JSON.stringify(a) !== JSON.stringify(b),
      })
    }
  }
  for (const [key, label] of Object.entries(CORE_LABELS)) {
    if (!local || !(key in local) || key === "teamNumber" || key === "matchKey")
      continue
    const a = local[key]
    const b = remote ? remote[key] : undefined
    fields.push({
      path: key,
      label,
      mine: show(game, undefined, a),
      theirs: remote ? show(game, undefined, b) : null,
      changed: JSON.stringify(a) !== JSON.stringify(b),
    })
  }

  const summary = {
    "rev-mismatch":
      "Someone else saved a newer version while you were editing.",
    "deleted-remotely":
      "This was deleted on the server while you were editing.",
    duplicate: "You already have an entry for this on another device.",
    rejected:
      conflict.serverErrors?.[0]?.message ??
      "The server didn’t accept this change.",
    forbidden: "You’re not allowed to make this change anymore.",
  }[conflict.kind]

  const actions: Array<ConflictAction> =
    conflict.kind === "rejected"
      ? form
        ? ["edit-and-retry", "discard"]
        : ["discard"]
      : conflict.kind === "forbidden"
        ? ["discard"]
        : ["keep-mine", "keep-theirs"]
  return { conflict, title, summary, fields, actions }
}
