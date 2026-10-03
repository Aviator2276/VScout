// The shared live alliance board (scout-tab.md B, ADR-032): one per event, read from Dexie like
// everything else; it changes through online-only actions (actions.ts), never the outbox.
import { useMemo } from "react"
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { useLiveOr, useRecordState } from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import type { AllianceBoardRecord } from "@/lib/db/types"

export function useAllianceBoard(
  eventKey: string
): DataState<AllianceBoardRecord> {
  const { db } = useDataRuntime()
  return useRecordState({
    enabled: true,
    source: { scope: `event:${eventKey}`, entity: "allianceBoard" },
    query: () => db.allianceBoards.get(eventKey),
    deps: [eventKey],
  })
}

/** Teams already on an alliance (picklist strike-through, Available panel). */
export function usePickedTeams(eventKey: string): ReadonlySet<number> {
  const { db } = useDataRuntime()
  const list = useLiveOr(
    async () => {
      const b = await db.allianceBoards.get(eventKey)
      if (!b) return []
      return b.alliances.flatMap((a) => [
        ...(a.captain ? [a.captain] : []),
        ...a.picks,
      ])
    },
    [eventKey],
    [] as Array<number>
  )
  return useMemo(() => new Set(list), [list])
}

/** Teams by event rank (captains, availability order without a picklist). */
export function useRankedTeams(eventKey: string): ReadonlyArray<number> {
  const { db } = useDataRuntime()
  return useLiveOr(
    async () =>
      (await db.eventTeams.where("eventKey").equals(eventKey).toArray())
        .filter((t) => t.rank !== null)
        .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
        .map((t) => t.teamNumber),
    [eventKey],
    [] as Array<number>
  )
}

/** Display names for history and "Already recorded by Alex". */
export function useUserNames(
  ids: ReadonlyArray<string>
): ReadonlyMap<string, string> {
  const { db } = useDataRuntime()
  const key = [...new Set(ids)].sort().join(",")
  const list = useLiveOr(
    async () =>
      (await db.users.bulkGet(key ? key.split(",") : [])).flatMap((u) =>
        u ? [[u.id, u.displayName] as const] : []
      ),
    [key],
    [] as Array<readonly [string, string]>
  )
  return useMemo(() => new Map(list), [list])
}

/** Availability order: the followed picklist (scout-tab.md B "Available"), or null without one. */
export function useFollowedOrder(
  eventKey: string
): ReadonlyArray<number> | null {
  const { db } = useDataRuntime()
  return useLiveOr(
    async () => {
      const id = (await db.eventSettings.get(eventKey))?.followedPicklistId
      if (!id) return null
      const entries = await db.picklistEntries
        .where("[picklistId+rank]")
        .between([id, ""], [id, "￿"])
        .toArray()
      return entries.map((e) => e.teamNumber)
    },
    [eventKey],
    null
  )
}

export function useNicknames(eventKey: string): ReadonlyMap<number, string> {
  const { db } = useDataRuntime()
  const list = useLiveOr(
    async () => {
      const et = await db.eventTeams
        .where("eventKey")
        .equals(eventKey)
        .toArray()
      const teams = await db.teams.bulkGet(et.map((t) => t.teamNumber))
      return teams.flatMap((t) =>
        t ? [[t.teamNumber, t.nickname] as const] : []
      )
    },
    [eventKey],
    [] as Array<readonly [number, string]>
  )
  return useMemo(() => new Map(list), [list])
}
