import { options } from "../kit/define-game"
import type { IncidentTaxonomy } from "../types"

export const incidents = {
  types: [
    {
      value: "noMovement",
      label: "inc.noMovement",
      defaultCategory: "electrical",
      countsAgainstReliability: true,
    },
    {
      value: "stutter",
      label: "inc.stutter",
      defaultCategory: "electrical",
      countsAgainstReliability: true,
    },
    {
      value: "mechanism",
      label: "inc.mechanism",
      defaultCategory: "mechanical",
      countsAgainstReliability: true,
    },
    {
      value: "tipped",
      label: "inc.tipped",
      defaultCategory: "driver",
      countsAgainstReliability: true,
    },
    {
      value: "stuck",
      label: "inc.stuck",
      defaultCategory: "driver",
      countsAgainstReliability: true,
    },
    {
      value: "bumperOff",
      label: "inc.bumperOff",
      defaultCategory: "mechanical",
      countsAgainstReliability: false,
    },
    {
      value: "fieldFault",
      label: "inc.fieldFault",
      defaultCategory: "field",
      countsAgainstReliability: false,
    },
    { value: "other", label: "inc.other", countsAgainstReliability: true },
  ],
  categories: options("inc.category", [
    "electrical",
    "mechanical",
    "software",
    "driver",
    "field",
    "unknown",
  ]),
  lengths: [
    { value: "brief", label: "inc.length.brief", minSec: 0, maxSec: 5 },
    { value: "short", label: "inc.length.short", minSec: 5, maxSec: 15 },
    { value: "long", label: "inc.length.long", minSec: 15, maxSec: null },
    {
      value: "restOfMatch",
      label: "inc.length.restOfMatch",
      minSec: 0,
      maxSec: null,
    },
  ],
  ignoreLengthsForReliability: ["brief"],
  resolutions: options("inc.resolution", [
    "recoveredSelf",
    "partnerHelped",
    "neverRecovered",
    "unclear",
  ]),
  phases: ["auto", "teleop", "endgame"],
} as const satisfies IncidentTaxonomy
