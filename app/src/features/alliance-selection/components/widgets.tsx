// The Alliance Selection widget (features/home.md H5): board status and our alliance; 8×4 shows all.
import { DataView } from "@/components/data-view/data-view"
import { WidgetCard } from "@/components/grid/widget-card"
import { Trophy } from "@/components/icons/icon"
import { useOurTeam } from "@/hooks/use-our-team"
import type { DataState } from "@/lib/db/react/data-state"
import type { AllianceBoardRecord } from "@/lib/db/types"
import type { WidgetProps } from "@/types/widget"
import { useAllianceBoard } from "../api/get-board"
import { nextPicker } from "../utils/selection-rules"

export function LiveAllianceWidget({ eventKey, w }: WidgetProps) {
  const board = useAllianceBoard(eventKey)
  const ourTeam = useOurTeam()
  const state: DataState<AllianceBoardRecord> =
    board.status === "success" && board.data.status === "notStarted"
      ? { status: "idle" }
      : board
  return (
    <WidgetCard title="Alliance Selection" href="/scout/alliance-selection">
      <DataView state={state} size="inline">
        <DataView.Idle icon={Trophy} title="Selection hasn’t started" />
        <DataView.Missing
          not-found={{ title: "Alliance board not downloaded yet" }}
          not-synced={{ title: "Alliance board not downloaded yet" }}
        />
        <DataView.Error title="Couldn’t load the board." />
        <DataView.Success>
          {(b: AllianceBoardRecord) => {
            const turn = nextPicker({
              alliances: b.alliances,
              declined: b.declined,
            })
            const ours = b.alliances.find(
              (a) => a.captain === ourTeam || a.picks.includes(ourTeam ?? -1)
            )
            const shown = w >= 8 ? b.alliances : ours ? [ours] : []
            return (
              <div className="flex flex-col gap-1 text-subhead">
                <p className="text-muted-foreground">
                  {turn
                    ? `Alliance ${turn.seed} picking`
                    : "Selection is complete"}
                  {b.locked ? " · Locked" : ""}
                </p>
                {shown.map((a) => (
                  <p key={a.seed} className="tabular-nums">
                    <span className="font-semibold">{a.seed}</span>{" "}
                    {[a.captain, ...a.picks].filter(Boolean).join(" · ")}
                  </p>
                ))}
              </div>
            )
          }}
        </DataView.Success>
      </DataView>
    </WidgetCard>
  )
}
