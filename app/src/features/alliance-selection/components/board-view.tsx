// The alliance board (scout-tab.md B, A1): status, a lock banner, eight alliances with captain and
// picks, and Record Pick in the thumb zone. The same view shows the live board and a personal sim.
import { useState } from "react"
import { Button } from "@/components/controls/button"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { SearchField } from "@/components/form/search-field"
import { Lock, Trophy, Undo2 } from "@/components/icons/icon"
import { Sheet } from "@/components/overlays/sheet"
import type { DataState } from "@/lib/db/react/data-state"
import { cn } from "@/lib/utils"
import { PICKS_PER_ALLIANCE, nextPicker } from "../utils/selection-rules"
import type { BoardState } from "../utils/selection-rules"

export interface BoardViewModel {
  board: BoardState
  status: "notStarted" | "inProgress" | "done"
  locked: boolean
}

export interface BoardViewProps {
  state: DataState<BoardViewModel>
  /** recording allowed now (role, lock, online) */
  canRecord: boolean
  /** why recording is off, shown under the button */
  recordHint: string | null
  /** tap an empty pick slot or Record Pick */
  onRecord: (seed: number) => void
  /** highlight a recently changed seed */
  changedSeed?: number | null
}

function Slot({ team, label }: { team: number | null; label: string }) {
  return (
    <span
      className={cn(
        "flex min-h-11 min-w-16 items-center justify-center rounded-xl px-2 font-heading text-headline tabular-nums",
        team
          ? "bg-card shadow-xs"
          : "border border-dashed border-border text-muted-foreground"
      )}
    >
      <span className="sr-only">{label}: </span>
      {team ?? "—"}
    </span>
  )
}

export function BoardView({
  state,
  canRecord,
  recordHint,
  onRecord,
  changedSeed,
}: BoardViewProps) {
  return (
    <DataView state={state} size="page">
      <DataView.Idle
        icon={Trophy}
        title="Selection hasn’t started"
        description="Captains come from the current rankings."
      />
      <DataView.Loading label="Loading the board…">
        <SkeletonRows rows={8} rowClassName="h-14" />
      </DataView.Loading>
      <DataView.Missing
        not-found={{
          title: "Rankings aren’t available yet, so captains can’t be filled",
        }}
        not-synced={{
          title: "Alliance board not downloaded yet",
          description: "Connect to download it.",
        }}
      />
      <DataView.Error title="Couldn’t load the alliance board." />
      <DataView.Success>
        {(m: BoardViewModel) => {
          const turn = nextPicker(m.board)
          return (
            <div className="flex flex-col gap-3 pb-24">
              <p role="status" className="text-subhead text-muted-foreground">
                {m.status === "done" || !turn
                  ? "Selection is complete"
                  : `Round ${turn.round} · Alliance ${turn.seed} picking`}
              </p>
              {m.locked ? (
                <p
                  role="status"
                  className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-subhead"
                >
                  <Lock aria-hidden size={16} /> Locked by an admin
                </p>
              ) : null}
              <ol aria-label="Alliances" className="flex flex-col gap-2">
                {m.board.alliances.map((a) => (
                  <li
                    key={a.seed}
                    aria-label={`Alliance ${a.seed}`}
                    className={cn(
                      "flex items-center gap-2 rounded-2xl bg-muted/60 p-2 transition-colors",
                      changedSeed === a.seed && "bg-primary/15",
                      turn?.seed === a.seed && "ring-2 ring-primary"
                    )}
                  >
                    <span className="w-6 text-center font-heading text-title-3">
                      {a.seed}
                    </span>
                    <Slot team={a.captain} label="Captain" />
                    {Array.from({ length: PICKS_PER_ALLIANCE }, (_, i) => {
                      const team = a.picks[i] ?? null
                      return team || !canRecord || !a.captain ? (
                        <Slot key={i} team={team} label={`Pick ${i + 1}`} />
                      ) : (
                        <button
                          key={i}
                          type="button"
                          onClick={() => onRecord(a.seed)}
                          aria-label={`Record pick ${i + 1} for Alliance ${a.seed}`}
                          className="flex min-h-11 min-w-16 items-center justify-center rounded-xl border border-dashed border-primary text-primary"
                        >
                          +
                        </button>
                      )
                    })}
                  </li>
                ))}
              </ol>
              <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-offset)+var(--tabbar-safe)+0.75rem)] z-20 px-safe-4 transition-[bottom] duration-300">
                <Button
                  size="large"
                  disabled={!canRecord || !turn}
                  onClick={() => turn && onRecord(turn.seed)}
                >
                  Record Pick
                </Button>
                {recordHint ? (
                  <p className="mt-1 text-center text-footnote text-muted-foreground">
                    {recordHint}
                  </p>
                ) : null}
              </div>
            </div>
          )
        }}
      </DataView.Success>
    </DataView>
  )
}

export interface RecordCandidate {
  teamNumber: number
  nickname: string
}

export function RecordSheet({
  seed,
  onOpenChange,
  candidates,
  busy,
  error,
  onPick,
  onDecline,
}: {
  seed: number | null
  onOpenChange: (open: boolean) => void
  /** available teams, in the order of the chosen source */
  candidates: ReadonlyArray<RecordCandidate>
  busy: boolean
  error: string | null
  onPick: (team: number) => void
  onDecline: (team: number) => void
}) {
  const [q, setQ] = useState("")
  const [chosen, setChosen] = useState<number | null>(null)
  const list = candidates.filter(
    (c) => !q.trim() || String(c.teamNumber).startsWith(q.trim())
  )
  return (
    <Sheet
      open={seed !== null}
      onOpenChange={(open) => {
        if (!open) setChosen(null)
        onOpenChange(open)
      }}
    >
      {seed !== null ? (
        <Sheet.Content
          title={`Alliance ${seed}`}
          description="Who did they pick?"
          closeLabel="Close"
        >
          <SearchField
            landmark="Available teams"
            label="Find a team"
            placeholder="Team number"
            value={q}
            onValueChange={setQ}
          />
          {error ? (
            <p
              role="alert"
              className="mb-2 rounded-xl bg-destructive/10 p-2 text-subhead"
            >
              {error}
            </p>
          ) : null}
          {candidates.length === 0 ? (
            <p
              role="status"
              className="py-6 text-center text-subhead text-muted-foreground"
            >
              Every team has been picked or declined
            </p>
          ) : (
            <ul aria-label="Available teams" className="flex flex-col">
              {list.map((c) => (
                <li
                  key={c.teamNumber}
                  className="flex min-h-12 items-center gap-2 border-b border-border/60"
                >
                  <button
                    type="button"
                    aria-pressed={chosen === c.teamNumber}
                    onClick={() => setChosen(c.teamNumber)}
                    className={cn(
                      "flex min-h-12 flex-1 items-center gap-3 px-1 text-left",
                      chosen === c.teamNumber && "text-primary"
                    )}
                  >
                    <span className="w-14 font-heading text-headline tabular-nums">
                      {c.teamNumber}
                    </span>
                    <span className="truncate text-subhead">{c.nickname}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDecline(c.teamNumber)}
                    className="min-h-11 px-2 text-footnote text-muted-foreground"
                  >
                    Declined
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="sticky bottom-0 bg-surface-grouped pt-3">
            <Button
              size="large"
              disabled={chosen === null || busy}
              onClick={() => chosen !== null && onPick(chosen)}
            >
              {chosen === null
                ? "Choose a Team"
                : `Record ${chosen} for Alliance ${seed}`}
            </Button>
          </div>
        </Sheet.Content>
      ) : null}
    </Sheet>
  )
}

export interface HistoryItem {
  id: string
  text: string
  at: number
  canUndo: boolean
}

const clock = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
})

export function HistorySheet({
  open,
  onOpenChange,
  items,
  onUndo,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: ReadonlyArray<HistoryItem>
  onUndo: (id: string) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <Sheet.Content title="History" detent="large">
        {items.length === 0 ? (
          <p
            role="status"
            className="py-6 text-center text-subhead text-muted-foreground"
          >
            No picks recorded yet
          </p>
        ) : (
          <ul aria-label="History" className="flex flex-col">
            {items.map((h) => (
              <li
                key={h.id}
                className="flex min-h-12 items-center gap-2 border-b border-border/60"
              >
                <span className="flex-1 text-subhead">{h.text}</span>
                <span className="text-footnote text-muted-foreground">
                  {clock.format(h.at)}
                </span>
                {h.canUndo ? (
                  <button
                    type="button"
                    aria-label={`Undo: ${h.text}`}
                    onClick={() => onUndo(h.id)}
                    className="inline-flex size-11 items-center justify-center text-primary"
                  >
                    <Undo2 aria-hidden size={18} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Sheet.Content>
    </Sheet>
  )
}
