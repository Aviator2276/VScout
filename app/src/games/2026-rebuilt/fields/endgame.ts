import { options } from "../../kit/define-game"
import type { SectionDef } from "../../types"

const played = { field: "pre.noShow", eq: false } as const

export const endgameSection = {
  id: "endgame",
  phase: "endgame",
  title: "phase.endgame",
  fields: [
    {
      kind: "choice",
      id: "endgame.climbResult",
      label: "endgame.climbResult",
      options: options("endgame.climbResult", [
        "none",
        "attemptFail",
        "level1",
        "level2",
        "level3",
      ]),
      required: { modes: ["new"] },
      visibleWhen: played,
      importance: "core",
    },
    {
      kind: "duration",
      id: "endgame.climbStart",
      label: "endgame.climbStart",
      buckets: [
        {
          value: "early",
          label: "endgame.climbStart.early",
          minSec: 20,
          maxSec: null,
        },
        {
          value: "mid",
          label: "endgame.climbStart.mid",
          minSec: 10,
          maxSec: 20,
        },
        {
          value: "late",
          label: "endgame.climbStart.late",
          minSec: 0,
          maxSec: 10,
        },
        {
          value: "didntTry",
          label: "endgame.climbStart.didntTry",
          minSec: 0,
          maxSec: 0,
        },
      ],
      visibleWhen: played,
      importance: "detail",
    },
    {
      kind: "boolean",
      id: "endgame.keptScoring",
      label: "endgame.keptScoring",
      visibleWhen: played,
      importance: "detail",
    },
  ],
} as const satisfies SectionDef
