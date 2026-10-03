// A match at a glance (owner: preview sheets): when it plays or how it ended, and both alliances.
// "View Match" goes to the full page.
import { Button } from "@/components/controls/button"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { Sheet } from "@/components/overlays/sheet"
import type { MatchRecord } from "@/lib/db/types"
import { cn } from "@/lib/utils"
import { longMatchLabel, parseMatchKey } from "@/utils/match-label"
import { useMatch } from "../api/get-matches"

const time = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
})

export function MatchPreviewSheet({
  matchKey,
  onOpenChange,
  onViewMatch,
}: {
  /** null closes the sheet */
  matchKey: string | null
  onOpenChange: (open: boolean) => void
  onViewMatch: (matchKey: string) => void
}) {
  const id = matchKey ? parseMatchKey(matchKey) : null
  return (
    <Sheet open={matchKey !== null} onOpenChange={onOpenChange}>
      {matchKey ? (
        <Sheet.Content
          title={id ? longMatchLabel(id) : "Match"}
          detent="medium"
        >
          <Preview matchKey={matchKey} onViewMatch={onViewMatch} />
        </Sheet.Content>
      ) : null}
    </Sheet>
  )
}

function Preview({
  matchKey,
  onViewMatch,
}: {
  matchKey: string
  onViewMatch: (matchKey: string) => void
}) {
  const state = useMatch(matchKey)
  return (
    <div className="flex flex-col gap-3">
      <DataView state={state} size="section">
        <DataView.Loading>
          <SkeletonRows rows={2} rowClassName="h-16" />
        </DataView.Loading>
        <DataView.Error title="Couldn’t load this match." />
        <DataView.Success>
          {(m: MatchRecord) => {
            const played = m.status === "played"
            const start = m.predictedTime ?? m.scheduledTime
            return (
              <div className="flex flex-col gap-2">
                <p className="text-subhead text-muted-foreground">
                  {played
                    ? `Played · ${m.winningAlliance === "red" ? "Red won" : m.winningAlliance === "blue" ? "Blue won" : "Tie"}`
                    : m.status === "onField"
                      ? "On the field now"
                      : start
                        ? `${m.predictedTime ? "Expected" : "Scheduled"} ${time.format(start)}`
                        : "Time not set"}
                </p>
                {(["red", "blue"] as const).map((side) => {
                  const a = m.alliances[side]
                  return (
                    <div
                      key={side}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border-s-4 px-4 py-3",
                        side === "red"
                          ? "border-alliance-red bg-alliance-red-muted"
                          : "border-alliance-blue bg-alliance-blue-muted"
                      )}
                    >
                      <span className="w-12 text-subhead font-semibold">
                        {side === "red" ? "Red" : "Blue"}
                      </span>
                      <span className="flex flex-1 gap-3 font-heading text-headline tabular-nums">
                        {a.teamNumbers.map((t) => (
                          <span key={t}>{t}</span>
                        ))}
                      </span>
                      {typeof a.score === "number" ? (
                        <span className="font-heading text-title-3 tabular-nums">
                          {a.score}
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )
          }}
        </DataView.Success>
      </DataView>
      <Button size="large" onClick={() => onViewMatch(matchKey)}>
        View Match
      </Button>
    </div>
  )
}
