// What every field control needs besides its own value: the season (labels, incident taxonomy,
// images), the scouter's level, the alliance (mirrored field drawings) and the section's phase.
import { createContext, use } from "react"
import type { GameDefinition, PhaseKind, ScouterLevel } from "@/games/types"
import type { IdGen } from "@/lib/ids"
import { uuidIds } from "@/lib/ids"

export interface FormEnv {
  game: GameDefinition
  level: ScouterLevel
  alliance: "red" | "blue" | null
  ids: IdGen
}

export const FormEnvContext = createContext<FormEnv | null>(null)
export const PhaseContext = createContext<PhaseKind | null>(null)

export function useFormEnv(): FormEnv {
  const env = use(FormEnvContext)
  if (!env) throw new Error("useFormEnv outside a scouting form")
  return env
}

export const defaultIds: IdGen = uuidIds
