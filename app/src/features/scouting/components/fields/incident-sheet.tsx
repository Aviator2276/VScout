// One incident in a sheet (ui-patterns §2.6, game-module.md §2.1). Done (top trailing) saves. New scouters pick a type, how long
// and how it ended from chips; experienced scouters may skip any of it and type notes instead.
// Both write the same IncidentValue, so stats never branch on level.
import { ChoiceChips } from "@/components/controls/choice-chips"
import { TextArea } from "@/components/form/text-field"
import { Sheet } from "@/components/overlays/sheet"
import { t } from "@/games/kit/labels"
import type { IncidentValue, PhaseKind } from "@/games/types"
import { useFormEnv } from "../form-context"

export function IncidentSheet({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: IncidentValue
  onChange: (next: IncidentValue) => void
}) {
  const { game, level } = useFormEnv()
  const tax = game.incidents
  const isNew = level === "new"
  const phaseLabel = (kind: PhaseKind) => {
    const def = game.phases.find((p) => p.kind === kind)
    return def ? t(game, def.label) : kind
  }
  const opts = (list: ReadonlyArray<{ value: string; label: string }>) =>
    list.map((o) => ({ value: o.value, label: t(game, o.label) }))
  const set = (patch: Partial<IncidentValue>) =>
    onChange({ ...value, ...patch })
  const missing = isNew && (value.type === null || value.length === null)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <Sheet.Content
        title="Robot Problem"
        description={
          isNew ? "Pick what happened and how long it lasted." : undefined
        }
        closeLabel="Done"
        detent="large"
      >
        <div className="flex flex-col gap-5 pb-4">
          {tax.phases.length > 1 ? (
            <Group label="When">
              <ChoiceChips
                label="When"
                options={tax.phases.map((p) => ({
                  value: p,
                  label: phaseLabel(p),
                }))}
                value={value.phase}
                onValueChange={(phase) => set({ phase })}
                size="form"
              />
            </Group>
          ) : null}
          <Group label={isNew ? "What happened" : "What happened (optional)"}>
            <ChoiceChips
              label="What happened"
              options={opts(tax.types)}
              value={value.type}
              onValueChange={(type) => {
                const def = tax.types.find((x) => x.value === type)
                set({
                  type,
                  category: value.category ?? def?.defaultCategory ?? null,
                })
              }}
              size="form"
            />
          </Group>
          <Group label="Likely cause">
            <ChoiceChips
              label="Likely cause"
              options={opts(tax.categories)}
              value={value.category}
              onValueChange={(category) => set({ category })}
            />
          </Group>
          <Group label={isNew ? "How long" : "How long (optional)"}>
            <ChoiceChips
              label="How long"
              options={opts(tax.lengths)}
              value={value.length}
              onValueChange={(length) => set({ length })}
              size="form"
            />
          </Group>
          {isNew ? (
            <Group label="How it ended">
              <ChoiceChips
                label="How it ended"
                options={opts(tax.resolutions)}
                value={value.resolution}
                onValueChange={(resolution) => set({ resolution })}
              />
            </Group>
          ) : (
            <TextArea
              label="Notes"
              value={value.note ?? ""}
              onValueChange={(note) => set({ note: note === "" ? null : note })}
              maxLength={500}
            />
          )}
          <TextArea
            label="What did the drive team do?"
            value={value.resolutionNote ?? ""}
            onValueChange={(note) =>
              set({ resolutionNote: note === "" ? null : note })
            }
            maxLength={500}
          />
        </div>
        {missing ? (
          <Sheet.Footer>
            <p className="text-center text-footnote text-muted-foreground">
              Add what happened and how long before you submit.
            </p>
          </Sheet.Footer>
        ) : null}
      </Sheet.Content>
    </Sheet>
  )
}

function Group({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-subhead font-medium">{label}</h3>
      {children}
    </section>
  )
}
