// Pit and post scouting (scouting-forms.md S2, S3). Pit adds the core robot profile above the
// game's pit form; post opens after the team's last qualification match (or early, by an admin).
import { createContext, use, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { Segmented } from "@/components/controls/segmented"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { TextField } from "@/components/form/text-field"
import { Camera, ClipboardList } from "@/components/icons/icon"
import type { GameDefinition, ScouterLevel } from "@/games/types"
import { useAddPhoto, usePhotoTiles, useRetryPhoto } from "../api/get-photos"
import type { PhotoTile } from "../api/get-photos"
import { useScoutTeam } from "../api/get-scout-target"
import type { ScoutTeam } from "../api/get-scout-target"
import { useEntrySession } from "../api/use-entry-session"
import type { ExtraValues } from "../api/use-entry-session"
import { EntryFormScreen } from "./entry-form-screen"
import { SessionBody } from "./match-scouting"

export interface TeamScoutingProps {
  kind: "pit" | "post"
  game: GameDefinition
  eventKey: string
  teamNumber: number
  level: ScouterLevel
  allowNew: boolean
  /** post: an admin, or the admin opened it early */
  postOverride: boolean
  stage: string | undefined
  onStageChange: (stage: string) => void
  online: boolean
  onSubmitted: (opts: { online: boolean }) => void
  nextActions: (close: () => void) => ReactNode
  /** the other scouters' pit entries, composed by the route */
  others?: ReactNode
}

export function TeamScouting(p: TeamScoutingProps) {
  const team = useScoutTeam(p.eventKey, p.teamNumber)
  return (
    <DataView state={team} size="page">
      <DataView.Loading label="Loading form…">
        <SkeletonRows rows={5} rowClassName="h-14" />
      </DataView.Loading>
      <DataView.Missing
        not-found={{ title: `Team ${p.teamNumber} isn’t at this event` }}
        not-synced={{
          title: "Team list not downloaded yet",
          description: "Connect to download it.",
        }}
      />
      <DataView.Error title="Couldn’t open the form." />
      <DataView.Success>
        {(t: ScoutTeam) =>
          p.kind === "post" && !t.qualsDone && !p.postOverride ? (
            <div
              role="status"
              className="flex flex-col items-center gap-2 py-12 text-center"
            >
              <ClipboardList
                aria-hidden
                size={48}
                className="text-muted-foreground"
              />
              <p className="text-title-3 font-medium">Not open yet</p>
              <p className="text-subhead text-muted-foreground">
                Post-scouting opens after {t.teamNumber}’s last qualification
                match.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-2 text-subhead text-muted-foreground">
                {t.nickname}
              </p>
              <TeamForm {...p} />
              {p.others}
            </>
          )
        }
      </DataView.Success>
    </DataView>
  )
}

/** Who the pit form's photos belong to (read by the robot profile block). */
const PitTargetContext = createContext<{
  eventKey: string
  teamNumber: number
}>({
  eventKey: "",
  teamNumber: 0,
})

function TeamForm(p: TeamScoutingProps) {
  const ctx = useMemo(
    () => ({ level: p.level, stage: "qual" as const }),
    [p.level]
  )
  const session = useEntrySession(p.game, {
    kind: p.kind,
    eventKey: p.eventKey,
    teamNumber: p.teamNumber,
    ctx,
    allowNew: p.allowNew,
  })
  const target = useMemo(
    () => ({ eventKey: p.eventKey, teamNumber: p.teamNumber }),
    [p.eventKey, p.teamNumber]
  )
  return (
    <PitTargetContext value={target}>
      <SessionBody
        session={session}
        render={(ready) => (
          <EntryFormScreen
            game={p.game}
            formDef={p.kind === "pit" ? p.game.pitForm : p.game.postForm}
            ctx={ctx}
            session={ready}
            alliance={null}
            stage={p.stage}
            onStageChange={p.onStageChange}
            online={p.online}
            onSubmitted={p.onSubmitted}
            nextActions={p.nextActions}
            {...(p.kind === "pit" ? { Extra: RobotProfile } : {})}
          />
        )}
      />
    </PitTargetContext>
  )
}

type Drivetrain = "swerve" | "tank" | "mecanum" | "other" | "unknown"

interface Robot {
  drivetrain: Drivetrain
  widthIn?: number
  lengthIn?: number
  weightLb?: number
}

/** The core robot profile (lib/contracts RobotProfile): game-independent facts. */
function RobotProfile({
  extra,
  onChange,
  recordId,
}: {
  extra: ExtraValues
  onChange: (next: ExtraValues) => void
  recordId: string
}) {
  const robot = (extra.robot ?? { drivetrain: "unknown" }) as Robot
  const set = (patch: Partial<Robot>) => {
    const next: Record<string, unknown> = { ...robot, ...patch }
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
    onChange({ ...extra, robot: next })
  }
  const num = (v: string) => {
    const n = Number(v)
    return v.trim() === "" || !Number.isFinite(n) || n <= 0 ? undefined : n
  }
  return (
    <section
      aria-labelledby="robot-profile"
      className="flex flex-col gap-3 rounded-2xl bg-card p-4"
    >
      <h2 id="robot-profile" className="font-heading text-title-3">
        Robot
      </h2>
      <Segmented
        label="Drivetrain"
        size="form"
        value={robot.drivetrain}
        onValueChange={(drivetrain) => set({ drivetrain })}
        options={[
          { value: "swerve", label: "Swerve" },
          { value: "tank", label: "Tank" },
          { value: "mecanum", label: "Mecanum" },
          { value: "other", label: "Other" },
        ]}
      />
      <PhotoStrip
        ids={(extra.photos ?? []) as Array<string>}
        recordId={recordId}
        onAdd={(id) =>
          onChange({
            ...extra,
            photos: [...((extra.photos ?? []) as Array<string>), id],
          })
        }
      />
      <div className="grid grid-cols-3 gap-2">
        <TextField
          label="Width (in)"
          type="number"
          inputMode="decimal"
          value={robot.widthIn === undefined ? "" : String(robot.widthIn)}
          onValueChange={(v) => set({ widthIn: num(v) })}
        />
        <TextField
          label="Length (in)"
          type="number"
          inputMode="decimal"
          value={robot.lengthIn === undefined ? "" : String(robot.lengthIn)}
          onValueChange={(v) => set({ lengthIn: num(v) })}
        />
        <TextField
          label="Weight (lb)"
          type="number"
          inputMode="decimal"
          value={robot.weightLb === undefined ? "" : String(robot.weightLb)}
          onValueChange={(v) => set({ weightLb: num(v) })}
        />
      </div>
    </section>
  )
}

const PHOTO_LABEL: Record<PhotoTile["state"], string> = {
  waiting: "Waiting to upload",
  uploading: "Uploading…",
  done: "Uploaded",
  failed: "Upload failed. Tap to retry.",
  missing: "Not on this device",
}

/** Robot photos (ADR-036): take or pick, upload in the background, retry a failed one. */
function PhotoStrip({
  ids,
  recordId,
  onAdd,
}: {
  ids: ReadonlyArray<string>
  recordId: string
  onAdd: (id: string) => void
}) {
  const target = use(PitTargetContext)
  const tiles = usePhotoTiles(ids)
  const add = useAddPhoto({ ...target, ownerRecordId: recordId })
  const retry = useRetryPhoto()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex gap-2 overflow-x-auto" aria-label="Robot photos">
        {tiles.map((p, i) => (
          <li key={p.id} className="relative shrink-0">
            <button
              type="button"
              disabled={p.state !== "failed"}
              onClick={() => void retry(p.id)}
              aria-label={`Photo ${i + 1}: ${PHOTO_LABEL[p.state]}`}
              className="block size-24 overflow-hidden rounded-xl bg-muted"
            >
              {p.url ? (
                <img src={p.url} alt="" className="size-full object-cover" />
              ) : null}
            </button>
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 rounded-b-xl bg-background/85 px-1 text-center text-caption-2"
            >
              {PHOTO_LABEL[p.state]}
            </span>
          </li>
        ))}
        <li className="shrink-0">
          <label className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-footnote text-primary">
            <Camera aria-hidden size={22} />
            {busy ? "Saving…" : "Add a Photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ""
                if (!file) return
                setBusy(true)
                add(file)
                  .then((id) => {
                    setError(null)
                    onAdd(id)
                  })
                  .catch(() => setError("Couldn’t save the photo. Try again."))
                  .finally(() => setBusy(false))
              }}
            />
          </label>
        </li>
      </ul>
      {error ? (
        <p role="alert" className="text-footnote text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
