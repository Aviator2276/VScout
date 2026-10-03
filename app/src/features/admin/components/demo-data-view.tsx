// Settings → Admin → Demo Data (features/admin.md AD7a, FX-60): generate a made-up event in the
// middle of qualifications to demo VScout or train new scouters, and delete it again. The server
// builds it (capabilities.demoSeed), so everyone on the team can pick it like a real event.
import { useState } from "react"
import { Button } from "@/components/controls/button"
import { Segmented } from "@/components/controls/segmented"
import { FlaskConical } from "@/components/icons/icon"
import { List } from "@/components/list/list"
import { ConfirmAlert } from "@/components/overlays/confirm-alert"
import type { DemoEventOptions } from "@/lib/contracts/demo-events"

export interface DemoEventRow {
  key: string
  name: string
}

const TEAMS = [
  { value: "24", label: "24" },
  { value: "36", label: "36" },
  { value: "48", label: "48" },
] as const
const PLAYED = [
  { value: "15", label: "Early" },
  { value: "50", label: "Middle" },
  { value: "85", label: "Late" },
] as const
const COVERAGE = [
  { value: "40", label: "Light" },
  { value: "75", label: "Typical" },
  { value: "100", label: "Full" },
] as const

export const randomSeed = () => 1 + Math.floor(Math.random() * 99_999)

export function DemoDataView({
  available,
  online,
  demoEvents,
  currentKey,
  initialSeed,
  onCreate,
  onDelete,
  onOpen,
}: {
  /** the server can make shared demo events (capabilities.demoSeed) */
  available: boolean
  online: boolean
  demoEvents: ReadonlyArray<DemoEventRow>
  currentKey: string
  initialSeed: number
  onCreate: (options: DemoEventOptions) => Promise<boolean>
  onDelete: (eventKey: string) => Promise<boolean>
  onOpen: (eventKey: string) => void
}) {
  const [teams, setTeams] = useState<(typeof TEAMS)[number]["value"]>("36")
  const [played, setPlayed] = useState<(typeof PLAYED)[number]["value"]>("50")
  const [coverage, setCoverage] =
    useState<(typeof COVERAGE)[number]["value"]>("75")
  const [seed, setSeed] = useState(initialSeed)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<DemoEventRow | null>(null)

  if (!available)
    return (
      <div
        role="status"
        className="mt-10 flex flex-col items-center gap-2 px-6 text-center"
      >
        <FlaskConical aria-hidden size={40} className="text-muted-foreground" />
        <p className="text-headline">Demo events need server support</p>
        <p className="text-subhead text-balance text-muted-foreground">
          This server can’t make demo events yet. Ask whoever runs your backend
          to turn on demo data.
        </p>
      </div>
    )

  const create = async () => {
    setBusy(true)
    const ok = await onCreate({
      seed,
      teams: Number(teams),
      playedPercent: Number(played),
      coveragePercent: Number(coverage),
    })
    setBusy(false)
    if (ok) setSeed(randomSeed())
  }

  return (
    <>
      <p className="mt-2 px-4 text-subhead text-muted-foreground">
        Make a realistic event in the middle of qualifications: teams, a
        schedule, results, scouting, chat and a picklist. Good for showing
        VScout or training new scouters.
      </p>

      <List.Section
        title="New Demo Event"
        footer="Demo data is made up. It never mixes with your real events."
      >
        <SegmentRow label="Teams">
          <Segmented
            label="Teams"
            options={TEAMS}
            value={teams}
            onValueChange={setTeams}
          />
        </SegmentRow>
        <SegmentRow label="Matches Played">
          <Segmented
            label="Matches played"
            options={PLAYED}
            value={played}
            onValueChange={setPlayed}
          />
        </SegmentRow>
        <SegmentRow label="Scouting Coverage">
          <Segmented
            label="Scouting coverage"
            options={COVERAGE}
            value={coverage}
            onValueChange={setCoverage}
          />
        </SegmentRow>
        <List.Row
          title="Seed"
          subtitle="The same seed makes the same event"
          detail={
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{seed}</span>
              <button
                type="button"
                onClick={() => setSeed(randomSeed())}
                className="min-h-11 px-1 text-primary"
              >
                New Seed
              </button>
            </span>
          }
        />
      </List.Section>

      <div className="mt-4 flex flex-col items-center gap-2 px-4">
        <Button
          size="large"
          className="w-full max-w-sm"
          disabled={!online || busy}
          onClick={() => void create()}
        >
          {busy ? "Creating Demo Event…" : "Create Demo Event"}
        </Button>
        {online ? null : (
          <p role="status" className="text-footnote text-muted-foreground">
            Needs connection
          </p>
        )}
      </div>

      {demoEvents.length > 0 ? (
        <List.Section title="Demo Events">
          {demoEvents.map((e) => (
            <List.Row
              key={e.key}
              title={e.name}
              subtitle={
                e.key === currentKey
                  ? "Open now. Switch events to delete it."
                  : undefined
              }
              detail={
                <span className="flex items-center gap-1">
                  {e.key === currentKey ? null : (
                    <button
                      type="button"
                      onClick={() => onOpen(e.key)}
                      className="min-h-11 px-2 text-primary"
                    >
                      Open
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!online || e.key === currentKey}
                    onClick={() => setDeleting(e)}
                    className="min-h-11 px-2 text-destructive disabled:opacity-40"
                  >
                    Delete
                  </button>
                </span>
              }
            />
          ))}
        </List.Section>
      ) : null}

      <ConfirmAlert
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null)
        }}
        title="Delete the demo event for everyone?"
        description="This removes all its matches, entries and messages."
        confirmLabel="Delete Demo Event"
        tone="destructive"
        onConfirm={() => {
          const target = deleting
          setDeleting(null)
          if (target) void onDelete(target.key)
        }}
      />
    </>
  )
}

function SegmentRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <span aria-hidden className="text-body">
        {label}
      </span>
      {children}
    </li>
  )
}
