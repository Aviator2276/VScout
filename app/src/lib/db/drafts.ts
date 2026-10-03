// Drafts: forms survive app kill (data-layer §12). Values are stored unvalidated; the draft id is
// the future record id, so submitting (mutate.createRecord with fromDraftId) is all or nothing.
import { formOf, stageOfMatchKey } from "@/games/kit/fields"
import { runMigrations } from "@/games/kit/migrate"
import { draftSchema } from "@/games/kit/schema"
import type { GameDefinition } from "@/games/types"
import type { VScoutDB } from "./schema"
import type { DraftRow } from "./types"

export type DraftKey = Pick<
  DraftRow,
  "userId" | "kind" | "eventKey" | "context" | "gameId" | "schemaVersion"
>

function sameContext(a: DraftRow["context"], b: DraftRow["context"]): boolean {
  return (
    a.matchKey === b.matchKey &&
    a.teamNumber === b.teamNumber &&
    a.station === b.station
  )
}

/** Resumes the user's draft for the same context, or starts a new one. */
export async function openDraft(
  db: VScoutDB,
  key: DraftKey,
  deps: { now: number; newId: () => string }
): Promise<DraftRow> {
  return db.transaction("rw", db.drafts, async () => {
    const existing = await db.drafts
      .where("[userId+kind]")
      .equals([key.userId, key.kind])
      .filter(
        (d) =>
          d.eventKey === key.eventKey && sameContext(d.context, key.context)
      )
      .first()
    if (existing) return existing
    const draft: DraftRow = {
      ...key,
      id: deps.newId(),
      values: {},
      createdAt: deps.now,
      updatedAt: deps.now,
    }
    await db.drafts.add(draft)
    return draft
  })
}

export async function saveDraft(
  db: VScoutDB,
  id: string,
  values: Record<string, unknown>,
  now: number,
  stage?: string
): Promise<void> {
  await db.drafts.update(id, {
    values,
    updatedAt: now,
    ...(stage ? { stage } : {}),
  })
}

export async function deleteDraft(db: VScoutDB, id: string): Promise<void> {
  await db.drafts.delete(id)
}

/** Drafts are per user: other users on the device never see them. */
export async function listDrafts(
  db: VScoutDB,
  userId: string,
  eventKey: string
): Promise<Array<DraftRow>> {
  const rows = await db.drafts
    .where("[userId+eventKey]")
    .equals([userId, eventKey])
    .toArray()
  return rows.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Boot step (game-module §6, scouting-forms criterion 11): drafts saved under an older form version
 * run through the module's migrations. One that still doesn't fit is kept and flagged, never lost.
 */
export async function migrateDrafts(
  db: VScoutDB,
  games: (gameId: string) => GameDefinition | null
): Promise<{ migrated: number; flagged: number }> {
  let migrated = 0
  let flagged = 0
  const drafts = await db.drafts.toArray()
  for (const d of drafts) {
    const game = games(d.gameId)
    if (!game || d.schemaVersion >= game.schemaVersion) continue
    const values = d.values as { data?: Record<string, unknown> }
    try {
      const result = runMigrations(game, values.data ?? {}, d.schemaVersion)
      const form = formOf(game, d.kind === "comment" ? "match" : d.kind)
      const ok = draftSchema(game, form, {
        level: "experienced",
        stage: stageOfMatchKey(d.context.matchKey),
      }).safeParse(result.data).success
      await db.drafts.update(d.id, {
        values: { ...d.values, data: result.data },
        schemaVersion: result.schemaVersion,
        ...(ok ? {} : { needsReview: true as const }),
      })
      if (ok) migrated++
      else flagged++
    } catch {
      await db.drafts.update(d.id, { needsReview: true })
      flagged++
    }
  }
  return { migrated, flagged }
}
