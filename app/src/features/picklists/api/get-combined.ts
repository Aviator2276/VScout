// Inputs for the combined picklist (P3): every list's team order, reasons and owner, read live.
import { useDataRuntime, useViewer } from "@/lib/db/react/data-runtime"
import { useLiveOr } from "@/lib/db/react/data-state-hooks"
import type { SourceList } from "../utils/combine"

interface Sources {
  lists: ReadonlyArray<SourceList>
  nicknames: ReadonlyMap<number, string>
}

const NONE: Sources = { lists: [], nicknames: new Map() }

export function useCombineSources(eventKey: string): Sources {
  const { db } = useDataRuntime()
  const userId = useViewer()?.userId ?? null
  return useLiveOr(
    async () => {
      const [lists, entries, settings] = await Promise.all([
        db.picklists.where("eventKey").equals(eventKey).toArray(),
        db.picklistEntries.where("eventKey").equals(eventKey).toArray(),
        db.eventSettings.get(eventKey),
      ])
      const users = await db.users.bulkGet([
        ...new Set(lists.map((l) => l.ownerId)),
      ])
      const names = new Map(
        users.flatMap((u) => (u ? [[u.id, u.displayName] as const] : []))
      )
      const teams = await db.teams.bulkGet([
        ...new Set(entries.map((e) => e.teamNumber)),
      ])
      return {
        nicknames: new Map(
          teams.flatMap((t) => (t ? [[t.teamNumber, t.nickname] as const] : []))
        ),
        lists: lists.map((l) => {
          const mine = entries
            .filter((e) => e.picklistId === l.id)
            .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
          return {
            id: l.id,
            owner:
              l.ownerId === userId
                ? "You"
                : (names.get(l.ownerId) ?? "Someone"),
            purpose: l.purpose,
            followed: settings?.followedPicklistId === l.id,
            teams: mine.map((e) => e.teamNumber),
            reasons: new Map(
              mine.flatMap((e) =>
                e.reason ? [[e.teamNumber, e.reason] as const] : []
              )
            ),
          }
        }),
      }
    },
    [eventKey, userId],
    NONE
  )
}
