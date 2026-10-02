// Played-match coverage for Settings → Admin (overview card, Data Quality): matches and entries
// come from two features, so the app layer joins them.
import { useMemo } from "react"
import { coverageSummary } from "@/features/admin/utils/coverage"
import type {
  CoverageSummary,
  PlayedMatch,
} from "@/features/admin/utils/coverage"
import {
  useEventMatches,
  useMatchCoverage,
} from "@/features/matches/api/get-matches"
import type { DataState } from "@/lib/db/react/data-state"
import {
  compareMatchIds,
  parseMatchKey,
  shortMatchLabel,
} from "@/utils/match-label"

export function useAdminCoverage(eventKey: string): DataState<CoverageSummary> {
  const matches = useEventMatches(eventKey)
  const counts = useMatchCoverage(eventKey)
  return useMemo((): DataState<CoverageSummary> => {
    if (matches.status !== "success")
      return matches.status === "empty"
        ? { status: "success", data: coverageSummary([], counts) }
        : matches
    const played: Array<
      PlayedMatch & { id: NonNullable<ReturnType<typeof parseMatchKey>> }
    > = []
    for (const m of matches.data) {
      const id = parseMatchKey(m.id)
      if (!id || m.status !== "played") continue
      played.push({
        id,
        key: m.id,
        label: shortMatchLabel(id),
        teams: [0, 1, 2, 3, 4, 5].map((i) =>
          i < 3
            ? m.alliances.red.teamNumbers[i]
            : m.alliances.blue.teamNumbers[i - 3]
        ),
      })
    }
    played.sort((a, b) => compareMatchIds(a.id, b.id))
    return { status: "success", data: coverageSummary(played, counts) }
  }, [matches, counts])
}
