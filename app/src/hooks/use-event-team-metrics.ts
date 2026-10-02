// Derived per-team metrics for one event (ADR-020): computed once per event and window from the
// scouting tables and re-run only when they change. Teams, picklists and strategy all read it.
import { useState } from "react"
import { activeGame } from "@/config/game"
import { DEFAULT_RECOMMENDER } from "@/lib/contracts/event-settings"
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { useLiveOr } from "@/lib/db/react/data-state-hooks"
import { computeEventTeamMetrics } from "@/lib/metrics/event-team-metrics"
import type {
  MetricWindow,
  TeamMetrics,
} from "@/lib/metrics/event-team-metrics"

export interface EventMetrics {
  /** null until the first compute finishes */
  byTeam: ReadonlyMap<number, TeamMetrics> | null
  /** the window changed and the new numbers are still computing */
  refreshing: boolean
  /** covered-matches target for Under-Scouted (ADR-031) */
  coverageTarget: number
}

interface Computed {
  window: MetricWindow
  byTeam: ReadonlyMap<number, TeamMetrics>
  coverageTarget: number
}

export function useEventTeamMetrics(
  eventKey: string,
  window: MetricWindow
): EventMetrics {
  const { db } = useDataRuntime()
  const computed = useLiveOr<Computed | null>(
    async () => {
      const [eventTeams, matches, entries, pit, post, allianceRanks, settings] =
        await Promise.all([
          db.eventTeams.where("eventKey").equals(eventKey).toArray(),
          db.matches.where("eventKey").equals(eventKey).toArray(),
          db.scoutEntries.where("eventKey").equals(eventKey).toArray(),
          db.pitScouting.where("eventKey").equals(eventKey).toArray(),
          db.postScouting.where("eventKey").equals(eventKey).toArray(),
          db.allianceRanks.where("eventKey").equals(eventKey).toArray(),
          db.eventSettings.get(eventKey),
        ])
      const rec = settings?.recommender ?? DEFAULT_RECOMMENDER
      return {
        window,
        coverageTarget: rec.segments * rec.targetPerSegment,
        byTeam: computeEventTeamMetrics(
          activeGame,
          {
            teams: eventTeams.map((t) => t.teamNumber),
            matches,
            entries,
            pit,
            post,
            allianceRanks,
            eventTeams,
            weights: settings?.metricWeights ?? {},
          },
          window
        ),
      }
    },
    [eventKey, window],
    null
  )
  // keep showing the previous numbers while a new window computes (never a skeleton, criterion 10)
  const [last, setLast] = useState<Computed | null>(null)
  if (computed && computed !== last) setLast(computed)
  const shown = computed ?? last
  return {
    byTeam: shown?.byTeam ?? null,
    refreshing: shown !== null && shown.window !== window,
    coverageTarget:
      shown?.coverageTarget ??
      DEFAULT_RECOMMENDER.segments * DEFAULT_RECOMMENDER.targetPerSegment,
  }
}
