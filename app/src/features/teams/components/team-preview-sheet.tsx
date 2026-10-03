// A team at a glance (owner: preview sheets where a full page is too much, e.g. picklists): the
// robot photo, rank and record, the first metrics, and a button to the full team page.
import { Button } from "@/components/controls/button"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { Camera } from "@/components/icons/icon"
import { Sheet } from "@/components/overlays/sheet"
import { activeGame } from "@/config/game"
import { t } from "@/games/kit/labels"
import { useEventTeamMetrics } from "@/hooks/use-event-team-metrics"
import { formatMetric } from "@/lib/metrics/format-metric"
import { useTeam, useTeamPhotos } from "../api/get-teams"
import type { TeamDetail } from "../api/get-teams"

const PREVIEW_METRICS = 4

export function TeamPreviewSheet({
  eventKey,
  teamNumber,
  onOpenChange,
  onViewTeam,
}: {
  eventKey: string
  /** null closes the sheet */
  teamNumber: number | null
  onOpenChange: (open: boolean) => void
  onViewTeam: (teamNumber: number) => void
}) {
  return (
    <Sheet open={teamNumber !== null} onOpenChange={onOpenChange}>
      {teamNumber !== null ? (
        <Sheet.Content title={`Team ${teamNumber}`} detent="medium">
          <Preview
            eventKey={eventKey}
            teamNumber={teamNumber}
            onViewTeam={onViewTeam}
          />
        </Sheet.Content>
      ) : null}
    </Sheet>
  )
}

function Preview({
  eventKey,
  teamNumber,
  onViewTeam,
}: {
  eventKey: string
  teamNumber: number
  onViewTeam: (teamNumber: number) => void
}) {
  const team = useTeam(eventKey, teamNumber)
  const photo = useTeamPhotos(eventKey, teamNumber)[0]
  const metrics = useEventTeamMetrics(eventKey, "all").byTeam?.get(teamNumber)
  return (
    <div className="flex flex-col gap-3">
      {photo ? (
        <img
          src={photo.thumbUrl ?? photo.url}
          alt={`Team ${teamNumber}’s robot`}
          className="aspect-[16/9] w-full rounded-2xl bg-muted object-cover"
        />
      ) : (
        <div className="flex h-20 items-center justify-center gap-2 rounded-2xl bg-muted text-subhead text-muted-foreground">
          <Camera aria-hidden size={18} /> No robot photo yet
        </div>
      )}
      <DataView state={team} size="section">
        <DataView.Loading>
          <SkeletonRows rows={2} />
        </DataView.Loading>
        <DataView.Error title="Couldn’t load this team." />
        <DataView.Success>
          {(d: TeamDetail) => (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-headline">{d.nickname}</p>
                <p className="text-subhead text-muted-foreground">
                  {[
                    d.rank ? `Rank ${d.rank}` : "Unranked",
                    d.record
                      ? `${d.record.wins}-${d.record.losses}-${d.record.ties}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-2">
                {activeGame.metrics.slice(0, PREVIEW_METRICS).map((def) => {
                  const f = formatMetric(def.format, metrics?.metrics[def.id])
                  return (
                    <div key={def.id} className="rounded-xl bg-card p-2.5">
                      <dt className="truncate text-footnote text-muted-foreground">
                        {t(activeGame, def.label)}
                      </dt>
                      <dd className="font-heading text-title-3 tabular-nums">
                        {f.text}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            </div>
          )}
        </DataView.Success>
      </DataView>
      <Button size="large" onClick={() => onViewTeam(teamNumber)}>
        View Team
      </Button>
    </div>
  )
}
