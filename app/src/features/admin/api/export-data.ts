// Export (AD7): read the event straight from Dexie at the moment of export.
import { useCallback } from "react"
import { activeGame } from "@/config/game"
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { entriesCsv } from "../utils/export-csv"

export type ExportKind = "entries-csv" | "all-json"

export function useExport(eventKey: string) {
  const { db } = useDataRuntime()
  return useCallback(
    async (
      kind: ExportKind
    ): Promise<{ name: string; type: string; text: string; count: number }> => {
      const users = new Map(
        (await db.users.toArray()).map((u) => [u.id, u.displayName])
      )
      const entries = await db.scoutEntries
        .where("eventKey")
        .equals(eventKey)
        .toArray()
      if (kind === "entries-csv") {
        const rows = entries
          .sort(
            (a, b) =>
              a.matchKey.localeCompare(b.matchKey, undefined, {
                numeric: true,
              }) || a.station.localeCompare(b.station)
          )
          .map((e) => ({
            id: e.id,
            matchKey: e.matchKey,
            teamNumber: e.teamNumber,
            station: e.station,
            authorName: users.get(e.authorId) ?? e.authorId,
            createdAt: e.createdAt,
            data: e.data,
          }))
        return {
          name: `${eventKey}-entries.csv`,
          type: "text/csv",
          text: entriesCsv(activeGame, rows),
          count: rows.length,
        }
      }
      const byEvent = <T>(rows: Array<T & { eventKey?: string | null }>) =>
        rows.filter((r) => r.eventKey === eventKey)
      const data = {
        eventKey,
        exportedAt: new Date().toISOString(),
        game: { id: activeGame.id, schemaVersion: activeGame.schemaVersion },
        scoutEntries: entries,
        pitScouting: byEvent(await db.pitScouting.toArray()),
        postScouting: byEvent(await db.postScouting.toArray()),
        // team notes only: private notes stay private (ADR-040)
        comments: byEvent(await db.comments.toArray()).filter(
          (c) => c.visibility === "team"
        ),
        picklists: byEvent(await db.picklists.toArray()),
        picklistEntries: byEvent(await db.picklistEntries.toArray()),
        matches: byEvent(await db.matches.toArray()),
        eventTeams: byEvent(await db.eventTeams.toArray()),
      }
      return {
        name: `${eventKey}-export.json`,
        type: "application/json",
        text: JSON.stringify(data, null, 2),
        count: entries.length,
      }
    },
    [db, eventKey]
  )
}
