// One section of a descriptor-driven form (game-module.md §4.2): the fields that apply to this
// scouter level and competition stage, shown only while their condition holds. For new scouters,
// "detail" fields fold under More Details.
import { useStore } from "@tanstack/react-form"
import { appliesTo, isVisible } from "@/games/kit/fields"
import type { FormContext } from "@/games/kit/fields"
import { t } from "@/games/kit/labels"
import type { FieldDef, SectionDef } from "@/games/types"
import type { ScoutingForm } from "../hooks/use-scouting-form"
import { decodeValues, toKey } from "../utils/form-values"
import type { ReviewIssue } from "../utils/form-values"
import { FieldControl } from "./fields/field-control"
import { PhaseContext, useFormEnv } from "./form-context"

export function FormSection({
  form,
  section,
  ctx,
  issues,
}: {
  form: ScoutingForm
  section: SectionDef
  ctx: FormContext
  /** shown inline once the scouter has opened Review */
  issues: ReadonlyArray<ReviewIssue>
}) {
  const { game, level } = useFormEnv()
  const data = useStore(form.store, (s) => s.values.data)
  const values = decodeValues({ data, tags: {} }).data
  const shown = section.fields.filter(
    (f) => appliesTo(f, ctx) && isVisible(f, values)
  )
  const core =
    level === "new" ? shown.filter((f) => f.importance !== "detail") : shown
  const detail =
    level === "new" ? shown.filter((f) => f.importance === "detail") : []
  const issueOf = (f: FieldDef) =>
    issues.find((i) => i.fieldId === f.id)?.message

  const render = (f: FieldDef) => {
    const key = toKey(f.id)
    return (
      <form.Field key={f.id} name={`data.${key}`}>
        {(field) => (
          <form.Field name={`tags.${key}`}>
            {(tags) => (
              <FieldControl
                field={f}
                value={field.state.value}
                onChange={(v) => field.handleChange(v)}
                label={t(game, f.label)}
                help={f.help && level === "new" ? t(game, f.help) : undefined}
                issue={issueOf(f)}
                tags={Array.isArray(tags.state.value) ? tags.state.value : []}
                onTagsChange={(next) => tags.handleChange(next)}
              />
            )}
          </form.Field>
        )}
      </form.Field>
    )
  }

  return (
    <PhaseContext value={section.phase ?? null}>
      <section
        aria-labelledby={`section-${section.id}`}
        className="flex flex-col"
      >
        <h2 id={`section-${section.id}`} className="font-heading text-title-2">
          {t(game, section.title)}
        </h2>
        {section.description ? (
          <p className="mt-1 text-subhead text-muted-foreground">
            {t(game, section.description)}
          </p>
        ) : null}
        <div className="mt-2 flex flex-col divide-y divide-border">
          {core.map(render)}
        </div>
        {shown.length === 0 ? (
          <p className="py-6 text-subhead text-muted-foreground">
            Nothing to answer here.
          </p>
        ) : null}
        {detail.length > 0 ? (
          <details className="mt-2 rounded-xl bg-muted/50 px-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-subhead font-medium">
              More Details ({detail.length})
            </summary>
            <div className="flex flex-col divide-y divide-border">
              {detail.map(render)}
            </div>
          </details>
        ) : null}
      </section>
    </PhaseContext>
  )
}
