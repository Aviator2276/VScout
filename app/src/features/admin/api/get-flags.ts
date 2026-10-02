// Validation flags for Data Quality (AD4 tab 2), with "Mark reviewed" kept on this device.
import { useCallback } from "react"
import { activeGame } from "@/config/game"
import { getKv, setKv } from "@/lib/db/kv"
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { useCollectionState } from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import { validationFlags } from "../utils/validation-flags"
import type { ValidationFlag } from "../utils/validation-flags"

export interface FlagsView {
  open: ReadonlyArray<ValidationFlag>
  reviewed: number
  missingBreakdowns: number
}

export function useValidationFlags(eventKey: string): DataState<FlagsView> {
  const { db } = useDataRuntime()
  const state = useCollectionState({
    enabled: true,
    source: { scope: `event:${eventKey}`, entity: "scoutEntry" },
    deps: [eventKey],
    share: () => "flags",
    query: async () => {
      const [matches, entries, reviewed] = await Promise.all([
        db.matches.where("eventKey").equals(eventKey).toArray(),
        db.scoutEntries.where("eventKey").equals(eventKey).toArray(),
        getKv(db, `reviewedFlags:${eventKey}`),
      ])
      const r = validationFlags(
        activeGame.validations,
        activeGame.scoringKeys,
        matches.filter((m) => m.status === "played"),
        entries.map((e) => ({
          id: e.id,
          matchKey: e.matchKey,
          teamNumber: e.teamNumber,
          station: e.station,
          authorId: e.authorId,
          data: e.data,
        }))
      )
      const done = new Set(reviewed ?? [])
      return [
        {
          open: r.flags.filter((f) => !done.has(f.id)),
          reviewed:
            r.flags.length - r.flags.filter((f) => !done.has(f.id)).length,
          missingBreakdowns: r.missingBreakdowns,
        },
      ]
    },
  })
  if (state.status === "success") {
    const [view] = state.data
    return view ? { status: "success", data: view } : { status: "empty" }
  }
  return state
}

export function useMarkReviewed(
  eventKey: string
): (flagId: string) => Promise<void> {
  const { db } = useDataRuntime()
  return useCallback(
    async (flagId) => {
      const key = `reviewedFlags:${eventKey}` as const
      const current = (await getKv(db, key)) ?? []
      await setKv(db, key, [...new Set([...current, flagId])])
    },
    [db, eventKey]
  )
}
