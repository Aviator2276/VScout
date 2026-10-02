// A scouting form screen around the descriptor-driven form (scouting-forms.md S1–S3): the banner
// that says whether this is a resumed draft or an edit, the form itself with autosave, and after
// submit the "what next" sheet. Full screen: the scouting layout supplies the close button.
import { useStore } from "@tanstack/react-form"
import { useEffect, useRef, useState } from "react"
import type { ComponentType, ReactNode } from "react"
import { CircleCheck, RefreshCw, TriangleAlert } from "@/components/icons/icon"
import { Sheet } from "@/components/overlays/sheet"
import type { FormContext } from "@/games/kit/fields"
import type { FormDef, GameDefinition } from "@/games/types"
import { haptic } from "@/lib/haptics"
import { uuidIds } from "@/lib/ids"
import type { EntrySession, ExtraValues } from "../api/use-entry-session"
import { useScoutingForm } from "../hooks/use-scouting-form"
import { decodeValues } from "../utils/form-values"
import { ScoutingFormView } from "./scouting-form-view"

const time = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
})

/** Wall-clock time for the "Draft saved" line (event handlers only). */
const stamp = () => Date.now()

type Ready = Extract<EntrySession, { status: "ready" }>

export interface EntryFormScreenProps {
  game: GameDefinition
  formDef: FormDef
  ctx: FormContext
  session: Ready
  alliance: "red" | "blue" | null
  /** a section id or "review" (kept in the URL by the route) */
  stage: string | undefined
  onStageChange: (stage: string) => void
  /** extra controls above the game form (the pit form's robot profile) */
  Extra?: ComponentType<{
    extra: ExtraValues
    onChange: (next: ExtraValues) => void
    /** the record id (edit) or future record id (new): photos attach to it */
    recordId: string
  }>
  /** after a successful submit: online decides the toast copy */
  online: boolean
  onSubmitted: (opts: { online: boolean }) => void
  /** the "what next" sheet's actions, composed by the route */
  nextActions: (close: () => void) => ReactNode
}

export function EntryFormScreen({
  game,
  formDef,
  ctx,
  session,
  alliance,
  stage,
  onStageChange,
  Extra,
  online,
  onSubmitted,
  nextActions,
}: EntryFormScreenProps) {
  const [extra, setExtraState] = useState<ExtraValues>(
    () => session.initial.extra ?? {}
  )
  // the form's listeners read the latest extra values after render
  const extraRef = useRef(extra)
  useEffect(() => {
    extraRef.current = extra
  })
  const [saved, setSaved] = useState<number | null>(session.resumedAt)
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const currentStage = stage ?? session.stage ?? formDef.sections[0]?.id ?? ""

  const form = useScoutingForm({
    game,
    form: formDef,
    ctx,
    initial: session.initial,
    onAutosave: (values) => {
      session.autosave({ ...values, extra: extraRef.current }, currentStage)
      setSaved(stamp())
    },
    onSubmit: async (values) => {
      try {
        await session.submit({ ...values, extra: extraRef.current })
        haptic("success")
        setFailed(null)
        setDone(true)
        onSubmitted({ online })
      } catch (error) {
        haptic("error")
        setFailed(error instanceof Error ? error.message : String(error))
      }
    },
  })
  const values = useStore(form.store, (s) => s.values)

  const setExtra = (next: ExtraValues) => {
    setExtraState(next)
    session.autosave({ ...decodeValues(values), extra: next }, currentStage)
    setSaved(stamp())
  }

  return (
    <div className="flex flex-col gap-3">
      {session.mode === "edit" ? (
        <Banner icon={<RefreshCw aria-hidden size={16} />}>
          You already scouted this. Editing your entry.
        </Banner>
      ) : null}
      {session.mode === "resume" && session.resumedAt !== null ? (
        <Banner
          icon={<RefreshCw aria-hidden size={16} />}
          action={
            <button
              type="button"
              className="min-h-11 px-2 text-primary"
              onClick={() => void session.startOver()}
            >
              Start Over
            </button>
          }
        >
          Resumed draft from {time.format(session.resumedAt)}
        </Banner>
      ) : null}
      {session.needsReview ? (
        <Banner icon={<TriangleAlert aria-hidden size={16} />}>
          The form changed since you started. Check your answers before
          submitting.
        </Banner>
      ) : null}
      {failed ? (
        <div
          role="alert"
          className="rounded-xl bg-destructive/10 p-3 text-subhead"
        >
          Couldn’t save: {failed}
        </div>
      ) : null}
      <p aria-live="polite" className="text-footnote text-muted-foreground">
        {saved ? `Draft saved ${time.format(saved)}` : "Answers save as you go"}
      </p>
      {Extra && currentStage === formDef.sections[0]?.id ? (
        <Extra extra={extra} onChange={setExtra} recordId={session.recordId} />
      ) : null}
      <ScoutingFormView
        env={{ game, level: ctx.level, alliance, ids: uuidIds }}
        formDef={formDef}
        ctx={ctx}
        form={form}
        stage={currentStage}
        onStageChange={onStageChange}
        submitLabel={session.mode === "edit" ? "Save Changes" : "Submit"}
      />
      <Sheet open={done} onOpenChange={setDone}>
        <Sheet.Content
          title={session.mode === "edit" ? "Changes saved" : "Entry saved"}
          description={
            online ? "Syncing now." : "It will sync when you’re online."
          }
        >
          <div className="flex flex-col items-center gap-4 py-4">
            <CircleCheck aria-hidden size={48} className="text-success" />
            <div className="flex w-full flex-col gap-2">
              {nextActions(() => setDone(false))}
            </div>
          </div>
        </Sheet.Content>
      </Sheet>
    </div>
  )
}

function Banner({
  icon,
  action,
  children,
}: {
  icon: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl bg-muted px-3 py-1 text-subhead"
    >
      {icon}
      <span className="flex-1 py-2">{children}</span>
      {action}
    </div>
  )
}
