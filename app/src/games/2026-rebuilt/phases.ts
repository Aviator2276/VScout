import type { PhaseDef } from "../types"

// Auto 20 s, teleop 2:20 = transition 10 s + 4 shifts × 25 s, then endgame 30 s (game-module §7.1).
export const phases = [
  { kind: "pre", label: "phase.pre" },
  { kind: "auto", label: "phase.auto", durationSec: 20, hint: "hint.auto" },
  {
    kind: "teleop",
    label: "phase.teleop",
    durationSec: 110,
    subPeriods: [
      { id: "transition", label: "period.transition", durationSec: 10 },
      { id: "shift1", label: "period.shift1", durationSec: 25 },
      { id: "shift2", label: "period.shift2", durationSec: 25 },
      { id: "shift3", label: "period.shift3", durationSec: 25 },
      { id: "shift4", label: "period.shift4", durationSec: 25 },
    ],
  },
  {
    kind: "endgame",
    label: "phase.endgame",
    durationSec: 30,
    hint: "hint.endgame",
  },
  { kind: "post", label: "phase.post" },
] as const satisfies ReadonlyArray<PhaseDef>
