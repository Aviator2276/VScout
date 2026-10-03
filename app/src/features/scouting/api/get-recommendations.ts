// "Needs scouting" for this user (scout-tab.md S1): the schedule and the live entries through the
// pure recommender. Idle while scouting is closed for scouters; empty when every robot is covered.
import { useMemo } from "react"
import { DEFAULT_RECOMMENDER } from "@/lib/contracts/event-settings"
import type { RecommenderConfig } from "@/lib/contracts/event-settings"
import { useDataRuntime, useViewer } from "@/lib/db/react/data-runtime"
import { useCollectionState, useLiveOr } from "@/lib/db/react/data-state-hooks"
import type { DataState } from "@/lib/db/react/data-state"
import type { DraftRow, MatchRecord } from "@/lib/db/types"
import { listDrafts } from "@/lib/db/drafts"
import { recommendSlots } from "../utils/recommend-slots"
import type { RecEntry, Recommendation } from "../utils/recommend-slots"

interface Inputs {
  entries: ReadonlyArray<RecEntry>
  drafts: ReadonlyArray<DraftRow>
  config: RecommenderConfig
  scoutingOpen: boolean
}

const NO_INPUTS: Inputs = {
  entries: [],
  drafts: [],
  config: DEFAULT_RECOMMENDER,
  scoutingOpen: true,
}

export function useRecommendation(
  eventKey: string,
  opts: { ourTeam: number | null; watched: ReadonlySet<number> }
): DataState<Recommendation> {
  const { db } = useDataRuntime()
  const viewer = useViewer()
  const userId = viewer?.userId ?? ""
  const matches = useCollectionState<MatchRecord>({
    enabled: true,
    source: { scope: `event:${eventKey}`, entity: "match" },
    query: () => db.matches.where("eventKey").equals(eventKey).toArray(),
    deps: [eventKey],
  })
  const inputs = useLiveOr(
    async (): Promise<Inputs> => {
      const [entries, drafts, settings] = await Promise.all([
        db.scoutEntries.where("eventKey").equals(eventKey).toArray(),
        userId ? listDrafts(db, userId, eventKey) : Promise.resolve([]),
        db.eventSettings.get(eventKey),
      ])
      return {
        entries: entries.map((e) => ({
          matchKey: e.matchKey,
          teamNumber: e.teamNumber,
          authorId: e.authorId,
        })),
        drafts,
        config: settings?.recommender ?? DEFAULT_RECOMMENDER,
        scoutingOpen: settings?.scoutingOpen ?? true,
      }
    },
    [eventKey, userId],
    NO_INPUTS
  )
  const { ourTeam, watched } = opts
  return useMemo((): DataState<Recommendation> => {
    if (!inputs.scoutingOpen && viewer?.role !== "admin")
      return { status: "idle" }
    if (matches.status !== "success") return matches
    const myDrafts = new Set(
      inputs.drafts
        .filter((d) => d.kind === "match")
        .map((d) => `${d.context.matchKey ?? ""}|${d.context.teamNumber ?? ""}`)
    )
    const rec = recommendSlots(
      {
        matches: matches.data.map((m) => ({
          key: m.key,
          compLevel: m.compLevel,
          setNumber: m.setNumber,
          matchNumber: m.matchNumber,
          scheduledTime: m.scheduledTime,
          status: m.status,
          red: m.alliances.red.teamNumbers,
          blue: m.alliances.blue.teamNumbers,
        })),
        entries: inputs.entries,
        userId,
        ourTeam,
        watched,
        myDrafts,
      },
      inputs.config
    )
    return rec.primary ? { status: "success", data: rec } : { status: "empty" }
  }, [matches, inputs, viewer?.role, userId, ourTeam, watched])
}

export interface ResumeDraft {
  id: string
  kind: DraftRow["kind"]
  matchKey: string | null
  teamNumber: number | null
  updatedAt: number
}

/** My unsubmitted forms for this event, newest first (hub Resume, `/scouting/mine` Drafts). */
export function useMyDrafts(
  eventKey: string
): DataState<ReadonlyArray<ResumeDraft>> {
  const { db } = useDataRuntime()
  const userId = useViewer()?.userId ?? null
  return useCollectionState({
    enabled: userId !== null,
    // drafts are local: they're "synced" as soon as the event schedule exists
    source: { scope: `event:${eventKey}`, entity: "match" },
    deps: [eventKey, userId],
    share: (d) => `${d.id}:${d.updatedAt}`,
    query: async () =>
      (userId ? await listDrafts(db, userId, eventKey) : [])
        .filter((d) => d.kind !== "comment")
        // an edit keeps a draft under the record's id; those resume from the entry, not here
        .map((d) => ({
          id: d.id,
          kind: d.kind,
          matchKey: d.context.matchKey ?? null,
          teamNumber: d.context.teamNumber ?? null,
          updatedAt: d.updatedAt,
        })),
  })
}

/** Robots I already scouted in this match (the picker's Edit My Entry). */
export function useMyMatchEntries(matchKey: string): ReadonlySet<number> {
  const { db } = useDataRuntime()
  const userId = useViewer()?.userId ?? ""
  const list = useLiveOr(
    async () =>
      (
        await db.scoutEntries
          .where("[eventKey+matchKey]")
          .equals([matchKey.split("_")[0] ?? "", matchKey])
          .toArray()
      )
        .filter((e) => e.authorId === userId)
        .map((e) => e.teamNumber),
    [matchKey, userId],
    [] as Array<number>
  )
  return useMemo(() => new Set(list), [list])
}
