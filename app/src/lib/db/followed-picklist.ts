// Which picklist the team follows (ADR-080): the master list for that purpose, built by an admin from
// the vote, takes priority over every other list. Without a master list the old admin pointer
// (eventSettings.followedPicklistId) still applies. Two admins making a master list at once (both
// offline) resolve to the older one on every device.
import type { PicklistRecord } from "./types"
import type { VScoutDB } from "./schema"

type Purpose = "first" | "second"

/** The master list for a purpose among an event's lists, or null. */
export function masterOf(
  lists: ReadonlyArray<PicklistRecord>,
  purpose: Purpose
): PicklistRecord | null {
  let best: PicklistRecord | null = null
  for (const l of lists)
    if (
      l.master &&
      l.purpose === purpose &&
      (!best ||
        l.createdAt < best.createdAt ||
        (l.createdAt === best.createdAt && l.id < best.id))
    )
      best = l
  return best
}

/** The followed list's id: the first-pick master list, else the admin pointer, else null. */
export async function followedPicklistId(
  db: VScoutDB,
  eventKey: string
): Promise<string | null> {
  const [lists, settings] = await Promise.all([
    db.picklists.where("eventKey").equals(eventKey).toArray(),
    db.eventSettings.get(eventKey),
  ])
  return masterOf(lists, "first")?.id ?? settings?.followedPicklistId ?? null
}
