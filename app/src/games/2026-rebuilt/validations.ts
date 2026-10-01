import type { ValidationDef } from "../types"

export const validations = [
  {
    id: "endgameClimb",
    matchField: "endgame.climbResult",
    tbaPerRobot: "endgameClimb",
    compare: "equal",
  },
  {
    id: "autoClimb",
    matchField: "auto.climb",
    tbaPerRobot: "autoClimb",
    compare: "equal",
  },
] as const satisfies ReadonlyArray<ValidationDef>
