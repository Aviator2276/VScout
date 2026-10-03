// The Rankings widget (features/home.md H5): rank, team, record; taller shows more teams.
import { DataView } from "@/components/data-view/data-view"
import { WidgetCard } from "@/components/grid/widget-card"
import { Trophy } from "@/components/icons/icon"
import type { DataState } from "@/lib/db/react/data-state"
import { settingCount, settingOn } from "@/config/widget-catalog"
import type { WidgetProps } from "@/types/widget"
import { useEventTeams } from "../api/get-teams"
import type { TeamRow } from "../utils/team-list"

export function RankingsWidget({ eventKey, w, h, config }: WidgetProps) {
  const upTo = settingCount("rankings", config, "rows")
  const names = settingOn("rankings", config, "showNames")
  const teams = useEventTeams(eventKey)
  const state: DataState<Array<TeamRow>> =
    teams.status === "success"
      ? (() => {
          const ranked = teams.data
            .filter((t) => t.rank !== null)
            .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
          return ranked.length
            ? { status: "success", data: ranked }
            : { status: "empty" }
        })()
      : teams
  return (
    <WidgetCard title="Rankings" href="/teams">
      <DataView state={state} size="inline">
        <DataView.Empty
          icon={Trophy}
          title="Rankings appear after the first qualification match"
        />
        <DataView.Missing
          not-synced={{ title: "Team list not downloaded yet" }}
        />
        <DataView.Error title="Couldn’t load rankings." />
        <DataView.Success>
          {(list: Array<TeamRow>) => (
            <ol className="flex flex-col gap-0.5 text-subhead">
              {list
                .slice(0, Math.min(upTo, Math.max(1, h * 2 - 1)))
                .map((t) => (
                  <li key={t.teamNumber} className="flex gap-2">
                    <span className="w-6 text-muted-foreground tabular-nums">
                      {t.rank}
                    </span>
                    <span className="w-12 font-heading tabular-nums">
                      {t.teamNumber}
                    </span>
                    {w >= 4 && names ? (
                      <span className="truncate text-muted-foreground">
                        {t.nickname}
                      </span>
                    ) : null}
                  </li>
                ))}
            </ol>
          )}
        </DataView.Success>
      </DataView>
    </WidgetCard>
  )
}
