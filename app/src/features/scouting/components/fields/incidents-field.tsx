// incidents → the list of logged robot problems with a big button to add one (game-module.md §2.1).
import { use, useState } from "react"
import { Button } from "@/components/controls/button"
import { Trash2 } from "@/components/icons/icon"
import { t } from "@/games/kit/labels"
import type {
  IncidentListField as IncidentsDef,
  IncidentValue,
} from "@/games/types"
import { PhaseContext, useFormEnv } from "../form-context"
import { FieldFrame } from "./field-frame"
import type { FieldProps } from "./field-props"
import { IncidentSheet } from "./incident-sheet"

export function asIncidents(value: unknown): Array<IncidentValue> {
  return Array.isArray(value) ? (value as Array<IncidentValue>) : []
}

export function IncidentsField({
  value,
  onChange,
  label,
  help,
  issue,
}: FieldProps<IncidentsDef>) {
  const { game, ids } = useFormEnv()
  const sectionPhase = use(PhaseContext)
  const list = asIncidents(value)
  const [editing, setEditing] = useState<IncidentValue | null>(null)
  const tax = game.incidents
  const labelOf = (
    options: ReadonlyArray<{ value: string; label: string }>,
    v: string | null
  ) => {
    const o = options.find((x) => x.value === v)
    return o ? t(game, o.label) : null
  }
  const summary = (i: IncidentValue) =>
    [labelOf(tax.types, i.type) ?? "Problem", labelOf(tax.lengths, i.length)]
      .filter(Boolean)
      .join(" · ")

  const startNew = () =>
    setEditing({
      id: ids.newId(),
      phase:
        sectionPhase && tax.phases.includes(sectionPhase)
          ? sectionPhase
          : (tax.phases[0] ?? "teleop"),
      type: null,
      category: null,
      length: null,
      resolution: null,
      resolutionNote: null,
      note: null,
    })
  const save = () => {
    if (!editing) return
    const exists = list.some((i) => i.id === editing.id)
    onChange(
      exists
        ? list.map((i) => (i.id === editing.id ? editing : i))
        : [...list, editing]
    )
    setEditing(null)
  }

  return (
    <FieldFrame label={label} help={help} issue={issue}>
      {() => (
        <div className="flex flex-col gap-2">
          {list.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {list.map((i) => (
                <li
                  key={i.id}
                  className="flex min-h-14 items-center gap-2 rounded-xl bg-muted px-3"
                >
                  <button
                    type="button"
                    onClick={() => setEditing(i)}
                    className="min-h-11 flex-1 text-left text-body"
                  >
                    {summary(i)}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${summary(i)}`}
                    onClick={() => onChange(list.filter((x) => x.id !== i.id))}
                    className="inline-flex size-11 items-center justify-center rounded-full text-destructive"
                  >
                    <Trash2 aria-hidden size={18} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Button variant="secondary" size="large" onClick={startNew}>
            Robot Stopped or Broke
          </Button>
          {editing ? (
            <IncidentSheet
              open
              onOpenChange={(open) => {
                // Done, swipe-down and Escape all keep what was entered (nothing is ever unsaved)
                if (!open) save()
              }}
              value={editing}
              onChange={setEditing}
            />
          ) : null}
        </div>
      )}
    </FieldFrame>
  )
}
