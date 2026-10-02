// A multi-stage scouting form (ui-patterns §2.1): the stage stepper on top, one section at a time,
// Previous / Next at the bottom, and Review at the end listing what's missing. Stages never block:
// a scouter can't stop watching the match to fix an answer.
import { useStore } from "@tanstack/react-form"
import { useId, useMemo, useRef, useState } from "react"
import { Button } from "@/components/controls/button"
import { StageStepper } from "@/components/controls/stage-stepper"
import type { StepStatus } from "@/components/controls/stage-stepper"
import { CircleAlert, CircleCheck } from "@/components/icons/icon"
import type { FormContext } from "@/games/kit/fields"
import { t } from "@/games/kit/labels"
import type { FormDef } from "@/games/types"
import type { ScoutingForm } from "../hooks/use-scouting-form"
import { decodeValues, reviewIssues } from "../utils/form-values"
import { FormEnvContext } from "./form-context"
import type { FormEnv } from "./form-context"
import { FormSection } from "./form-section"

export const REVIEW = "review"

/** Submit ignores taps this soon after Review opened: a double tap on Review isn't a submit. */
export const SUBMIT_GUARD_MS = 400

export interface ScoutingFormViewProps {
  env: FormEnv
  formDef: FormDef
  ctx: FormContext
  form: ScoutingForm
  /** a section id, or "review" (the route keeps it in ?stage=) */
  stage: string
  onStageChange: (stage: string) => void
  submitLabel?: string
}

export function ScoutingFormView({
  env,
  formDef,
  ctx,
  form,
  stage,
  onStageChange,
  submitLabel = "Submit",
}: ScoutingFormViewProps) {
  const panelId = useId()
  const { game } = env
  const sections = formDef.sections
  const [visited, setVisited] = useState<ReadonlySet<string>>(
    () => new Set([stage])
  )
  const data = useStore(form.store, (s) => s.values.data)
  const submitting = useStore(form.store, (s) => s.isSubmitting)
  const issues = useMemo(
    () =>
      reviewIssues(game, formDef, ctx, decodeValues({ data, tags: {} }).data),
    [game, formDef, ctx, data]
  )
  const reviewed = visited.has(REVIEW)
  const index = sections.findIndex((s) => s.id === stage)
  const current = sections[index]

  // a quick second tap on Review must not also submit (gloves, stage nav reuses the spot)
  const reviewOpenedAt = useRef(0)
  const go = (next: string) => {
    if (next === REVIEW) reviewOpenedAt.current = performance.now()
    setVisited((v) => new Set([...v, next]))
    onStageChange(next)
    window.scrollTo({ top: 0 })
  }
  const status = (id: string): StepStatus => {
    if (!visited.has(id)) return "todo"
    return issues.some((i) => i.sectionId === id) && (reviewed || id !== stage)
      ? "issue"
      : "done"
  }

  return (
    <FormEnvContext value={env}>
      <div className="flex flex-col gap-4 pb-[calc(var(--k-safe-area-bottom)+96px)]">
        {sections.length > 1 ? (
          <StageStepper
            label="Stages"
            steps={sections.map((s) => ({
              id: s.id,
              label: t(game, s.title),
              status: status(s.id),
            }))}
            current={current ? current.id : (sections.at(-1)?.id ?? "")}
            onSelect={go}
            panelId={panelId}
          />
        ) : null}

        <div id={panelId} role={sections.length > 1 ? "tabpanel" : undefined}>
          {current ? (
            <FormSection
              form={form}
              section={current}
              ctx={ctx}
              issues={reviewed ? issues : []}
            />
          ) : (
            <Review
              issues={issues}
              sectionTitle={(id) => {
                const s = sections.find((x) => x.id === id)
                return s ? t(game, s.title) : id
              }}
              fieldLabel={(id) => {
                const f = sections
                  .flatMap((s) => s.fields)
                  .find((x) => x.id === id)
                return f ? t(game, f.label) : id
              }}
              onJump={go}
            />
          )}
        </div>

        <nav
          aria-label="Stage navigation"
          className="fixed inset-x-0 bottom-0 z-20 flex gap-3 glass pt-3 px-safe-4 pb-safe-4"
        >
          {index > 0 || !current ? (
            <Button
              variant="secondary"
              size="large"
              className="flex-1"
              onClick={() =>
                go(
                  current
                    ? (sections[index - 1]?.id ?? "")
                    : (sections.at(-1)?.id ?? "")
                )
              }
            >
              Previous
            </Button>
          ) : null}
          {current ? (
            <Button
              key="next"
              size="large"
              className="flex-1"
              onClick={() => go(sections[index + 1]?.id ?? REVIEW)}
            >
              {index === sections.length - 1 ? "Review" : "Next"}
            </Button>
          ) : (
            <Button
              key="submit"
              size="large"
              className="flex-1"
              disabled={issues.length > 0 || submitting}
              onClick={() => {
                if (
                  performance.now() - reviewOpenedAt.current <
                  SUBMIT_GUARD_MS
                )
                  return
                void form.handleSubmit()
              }}
            >
              {submitting ? "Saving…" : submitLabel}
            </Button>
          )}
        </nav>
      </div>
    </FormEnvContext>
  )
}

function Review({
  issues,
  sectionTitle,
  fieldLabel,
  onJump,
}: {
  issues: ReturnType<typeof reviewIssues>
  sectionTitle: (id: string) => string
  fieldLabel: (id: string) => string
  onJump: (sectionId: string) => void
}) {
  if (issues.length === 0)
    return (
      <section
        aria-labelledby="review-title"
        className="flex flex-col items-center gap-2 py-10 text-center"
      >
        <CircleCheck aria-hidden size={40} className="text-success" />
        <h2 id="review-title" className="font-heading text-title-2">
          Ready to submit
        </h2>
        <p className="text-subhead text-muted-foreground">
          Every required answer is in. You can still go back and change
          anything.
        </p>
      </section>
    )
  return (
    <section aria-labelledby="review-title" className="flex flex-col gap-3">
      <h2 id="review-title" className="font-heading text-title-2">
        {issues.length === 1
          ? "1 answer needed"
          : `${issues.length} answers needed`}
      </h2>
      <p className="text-subhead text-muted-foreground">
        Tap one to go back to it. Your answers are saved.
      </p>
      <ul className="flex flex-col gap-2">
        {issues.map((i) => (
          <li key={i.fieldId}>
            <button
              type="button"
              onClick={() => onJump(i.sectionId)}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-muted px-3 text-left"
            >
              <CircleAlert
                aria-hidden
                size={18}
                className="shrink-0 text-warning"
              />
              <span className="flex-1">
                <span className="block text-body">{fieldLabel(i.fieldId)}</span>
                <span className="block text-footnote text-muted-foreground">
                  {sectionTitle(i.sectionId)} · {i.message}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
