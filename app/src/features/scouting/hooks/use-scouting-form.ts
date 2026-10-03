// A scouting form's state (game-module.md §4.2: TanStack Form, the schema is the single source).
// Every change autosaves after 500 ms (ui-patterns §2.1: nothing is ever unsaved); submit prunes
// hidden answers and validates with the descriptor-derived schema.
import { useForm } from "@tanstack/react-form"
import { allFields, appliesTo, isVisible } from "@/games/kit/fields"
import type { FormContext } from "@/games/kit/fields"
import type { FormDef, GameDefinition } from "@/games/types"
import {
  decodeValues,
  encodeValues,
  pruneHidden,
  reviewIssues,
  withControlDefaults,
} from "../utils/form-values"
import type { EntryValues } from "../utils/form-values"

export const AUTOSAVE_MS = 500

export interface ScoutingFormOptions {
  game: Pick<GameDefinition, "id" | "schemaVersion" | "incidents">
  form: FormDef
  ctx: FormContext
  initial?: Partial<EntryValues>
  /** debounced; the caller writes the draft to Dexie */
  onAutosave?: (values: EntryValues) => void
  /** only called with values that pass the schema */
  onSubmit?: (values: EntryValues) => void | Promise<void>
}

export function useScoutingForm(o: ScoutingFormOptions) {
  return useForm({
    defaultValues: encodeValues({
      data: withControlDefaults(o.form, o.initial?.data ?? {}),
      tags: o.initial?.tags ?? {},
    }),
    listeners: {
      onChange: ({ formApi }) =>
        o.onAutosave?.(decodeValues(formApi.state.values)),
      onChangeDebounceMs: AUTOSAVE_MS,
    },
    onSubmit: async ({ value }) => {
      const decoded = decodeValues(value)
      const data = pruneHidden(o.form, o.ctx, decoded.data)
      if (reviewIssues(o.game, o.form, o.ctx, data).length > 0) return
      const shown = new Set(
        allFields(o.form)
          .filter((f) => appliesTo(f, o.ctx) && isVisible(f, data))
          .map((f) => f.id)
      )
      const tags = Object.fromEntries(
        Object.entries(decoded.tags).filter(
          ([id, t]) => shown.has(id) && t.length > 0
        )
      )
      await o.onSubmit?.({ data, tags })
    },
  })
}

export type ScoutingForm = ReturnType<typeof useScoutingForm>
