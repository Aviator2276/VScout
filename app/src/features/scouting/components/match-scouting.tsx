// Match scouting (scouting-forms.md S1): resolves the robot's station from the schedule, then opens
// the form for this scouter's level. Every state from the S1 data-states row has its own message.
import { useMemo } from "react"
import type { ReactNode } from "react"
import { Button } from "@/components/controls/button"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { CalendarDays, Lock } from "@/components/icons/icon"
import { stageOfMatchKey } from "@/games/kit/fields"
import type { GameDefinition, ScouterLevel } from "@/games/types"
import type { DataState } from "@/lib/db/react/data-state"
import type { MatchRecord } from "@/lib/db/types"
import { cn } from "@/lib/utils"
import { longMatchLabel, parseMatchKey } from "@/utils/match-label"
import { useScoutMatch } from "../api/get-scout-target"
import { useEntrySession } from "../api/use-entry-session"
import type { EntrySession } from "../api/use-entry-session"
import { STATION_ORDER } from "../utils/recommend-slots"
import type { Station } from "../utils/recommend-slots"
import { EntryFormScreen } from "./entry-form-screen"

export function stationOf(m: MatchRecord, team: number): Station | null {
  const red = m.alliances.red.teamNumbers.indexOf(team)
  if (red >= 0) return STATION_ORDER[red] ?? null
  const blue = m.alliances.blue.teamNumbers.indexOf(team)
  return blue >= 0 ? (STATION_ORDER[blue + 3] ?? null) : null
}

export function stationLabel(s: Station): string {
  return `${s.startsWith("red") ? "Red" : "Blue"} ${s.slice(-1)}`
}

export interface MatchScoutingProps {
  game: GameDefinition
  eventKey: string
  matchKey: string
  teamNumber: number
  level: ScouterLevel
  /** scouting is open for this user (open, or an admin) */
  allowNew: boolean
  stage: string | undefined
  onStageChange: (stage: string) => void
  online: boolean
  onSubmitted: (opts: { online: boolean }) => void
  nextActions: (close: () => void) => ReactNode
  /** "The schedule changed" → pick another station */
  onPickStation: () => void
}

export function MatchScouting(p: MatchScoutingProps) {
  const state = useScoutMatch(p.eventKey, p.matchKey)
  const id = parseMatchKey(p.matchKey)
  const label = id ? longMatchLabel(id) : p.matchKey
  const scoped: DataState<MatchRecord> = p.matchKey.startsWith(`${p.eventKey}_`)
    ? state
    : { status: "missing", reason: "not-found" }
  return (
    <DataView state={scoped} size="page">
      <DataView.Loading label="Loading form…">
        <SkeletonRows rows={5} rowClassName="h-14" />
      </DataView.Loading>
      <DataView.Missing
        not-found={{ title: `${label} isn’t in this event` }}
        not-synced={{
          title: "This match hasn’t downloaded yet",
          description: "Connect to download the schedule.",
        }}
      />
      <DataView.Error title="Couldn’t open the form." />
      <DataView.Success>
        {(match: MatchRecord) => {
          const station = stationOf(match, p.teamNumber)
          if (!station)
            return (
              <div
                role="status"
                className="flex flex-col items-center gap-3 py-12 text-center"
              >
                <CalendarDays
                  aria-hidden
                  size={48}
                  className="text-muted-foreground"
                />
                <p className="text-title-3 font-medium">The schedule changed</p>
                <p className="text-subhead text-muted-foreground">
                  {p.teamNumber} isn’t in {label} anymore.
                </p>
                <Button variant="secondary" onClick={p.onPickStation}>
                  Pick a Robot
                </Button>
              </div>
            )
          return <MatchForm {...p} station={station} />
        }}
      </DataView.Success>
    </DataView>
  )
}

function MatchForm(p: MatchScoutingProps & { station: Station }) {
  const ctx = useMemo(
    () => ({ level: p.level, stage: stageOfMatchKey(p.matchKey) }),
    [p.level, p.matchKey]
  )
  const session = useEntrySession(p.game, {
    kind: "match",
    eventKey: p.eventKey,
    teamNumber: p.teamNumber,
    matchKey: p.matchKey,
    station: p.station,
    ctx,
    allowNew: p.allowNew,
  })
  const alliance = p.station.startsWith("red") ? "red" : "blue"
  return (
    <>
      <div
        className={cn(
          "mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-subhead font-semibold",
          alliance === "red"
            ? "bg-alliance-red text-alliance-red-foreground"
            : "bg-alliance-blue text-alliance-blue-foreground"
        )}
      >
        {stationLabel(p.station)}
        <span className="ms-auto rounded-full bg-background/20 px-2 text-caption-1">
          {p.level === "new" ? "Helpers on" : "Experienced"}
        </span>
      </div>
      <SessionBody
        session={session}
        render={(ready) => (
          <EntryFormScreen
            game={p.game}
            formDef={p.game.matchForm}
            ctx={ctx}
            session={ready}
            alliance={alliance}
            stage={p.stage}
            onStageChange={p.onStageChange}
            online={p.online}
            onSubmitted={p.onSubmitted}
            nextActions={p.nextActions}
          />
        )}
      />
    </>
  )
}

/** The non-form states of a form session: loading, closed, error, a draft that no longer fits. */
export function SessionBody({
  session,
  render,
}: {
  session: EntrySession
  render: (ready: Extract<EntrySession, { status: "ready" }>) => ReactNode
}) {
  switch (session.status) {
    case "loading":
      return (
        <DataView state={{ status: "loading" }} size="page">
          <DataView.Loading label="Loading form…">
            <SkeletonRows rows={5} rowClassName="h-14" />
          </DataView.Loading>
        </DataView>
      )
    case "closed":
      return (
        <div
          role="status"
          className="flex flex-col items-center gap-2 py-12 text-center"
        >
          <Lock aria-hidden size={48} className="text-muted-foreground" />
          <p className="text-title-3 font-medium">
            Scouting is closed for this event
          </p>
          <p className="text-subhead text-muted-foreground">
            You can still edit entries you already made.
          </p>
        </div>
      )
    case "error":
      return (
        <DataView state={session} size="page">
          <DataView.Error title="Couldn’t open the form." />
        </DataView>
      )
    case "corrupt":
      return (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 py-12 text-center"
        >
          <p className="text-title-3 font-medium">
            Your draft couldn’t be restored
          </p>
          <p className="text-subhead text-muted-foreground">
            The form changed and your saved answers don’t fit it anymore.
          </p>
          <Button variant="secondary" onClick={() => void session.startOver()}>
            Start Over
          </Button>
        </div>
      )
    case "ready":
      return <>{render(session)}</>
  }
}
