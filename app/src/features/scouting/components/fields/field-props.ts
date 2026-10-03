import type { FieldDef } from "@/games/types"

/** What the renderer hands every field control. `undefined` = not answered yet. */
export interface FieldProps<TField extends FieldDef> {
  field: TField
  value: unknown
  onChange: (value: unknown) => void
  label: string
  help?: string | undefined
  issue?: string | undefined
}

/** "Didn't see" is a real answer (null), different from not answered (undefined). */
export const UNKNOWN = "__unknown"
export const UNKNOWN_LABEL = "Didn't see"
