// Drafts: forms survive app kill (data-layer §12). Values are stored unvalidated; the draft id is
// the future record id, so submitting (mutate.createRecord with fromDraftId) is all or nothing.
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
