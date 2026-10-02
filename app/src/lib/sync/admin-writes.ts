// Admin singleton writes (features/admin.md AD3/AD3a): eventSettings and teamSettings go through the
// outbox with baseRev like any record, so they work offline and a concurrent admin edit becomes a
// conflict (keep mine / theirs). The server re-checks the role (ADR-003).
import type { EventSettingsRecord, TeamSettingsRecord } from "@/lib/db/types"
import { NotAllowedError } from "./errors"
import type { MutateDeps } from "./mutate"
import { enqueue } from "./outbox"

export type EventSettingsPatch = Partial<
  Pick<
    EventSettingsRecord,
    | "scoutingOpen"
    | "followedPicklistId"
    | "postScouting"
    | "metricWeights"
    | "notes"
  >
>

function requireUser(deps: MutateDeps): string {
  const s = deps.session()
  if (!s) throw new NotAllowedError("Sign in to make changes")
  return s.userId
}

export async function patchEventSettings(
  deps: MutateDeps,
  eventKey: string,
  patch: EventSettingsPatch
): Promise<void> {
  const userId = requireUser(deps)
  const { db } = deps
  await db.transaction("rw", [db.eventSettings, db.outbox], async () => {
    const now = deps.clock.now()
    const current = await db.eventSettings.get(eventKey)
    const next: EventSettingsRecord = {
      id: eventKey,
      eventKey,
      rev: 0,
      updatedAt: now,
      scoutingOpen: true,
      guestAccess: { enabled: false, code: null, rotatedAt: null },
      ...current,
      ...patch,
      syncState: "pending",
    }
    await db.eventSettings.put(next)
    await enqueue(db, {
      opId: deps.ids.newId(),
      userId,
      entity: "eventSettings",
      recordId: eventKey,
      eventKey,
      kind: "update",
      now,
    })
  })
  deps.onWrite?.()
}

export async function setTeamNumber(
  deps: MutateDeps,
  teamNumber: number | null
): Promise<void> {
  const userId = requireUser(deps)
  const { db } = deps
  await db.transaction("rw", [db.teamSettings, db.outbox], async () => {
    const now = deps.clock.now()
    const current = await db.teamSettings.get("team")
    const next: TeamSettingsRecord = {
      rev: 0,
      updatedAt: now,
      ...current,
      id: "team",
      teamNumber,
      syncState: "pending",
    }
    await db.teamSettings.put(next)
    await enqueue(db, {
      opId: deps.ids.newId(),
      userId,
      entity: "teamSettings",
      recordId: "team",
      eventKey: null,
      kind: "update",
      now,
    })
  })
  deps.onWrite?.()
}
