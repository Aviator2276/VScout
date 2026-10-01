import type { CapabilityDef } from "../types"

export const capabilities = [
  {
    id: "climbMax",
    label: "cap.climbMax",
    source: { pitField: "pit.climbMax" },
    confirmedBy: { matchField: "endgame.climbResult", rule: "maxOf" },
    display: "value",
  },
  {
    id: "fitsTrench",
    label: "cap.fitsTrench",
    source: { pitField: "pit.fitsTrench" },
    confirmedBy: {
      matchField: "teleop.travel",
      rule: "anyEquals",
      mapping: { trench: "true" },
    },
    display: "badge",
  },
  {
    id: "crossesBump",
    label: "cap.crossesBump",
    source: { pitField: "pit.crossesBump" },
    confirmedBy: {
      matchField: "teleop.travel",
      rule: "anyEquals",
      mapping: { bump: "true" },
    },
    display: "badge",
  },
  {
    id: "shooter",
    label: "cap.shooter",
    source: { pitField: "pit.shooter" },
    display: "value",
  },
] as const satisfies ReadonlyArray<CapabilityDef>
