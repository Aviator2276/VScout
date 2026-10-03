import { options } from "../../kit/define-game"
import type { SectionDef } from "../../types"

const played = { field: "pre.noShow", eq: false } as const

export const autoSection = {
  id: "auto",
  phase: "auto",
  title: "phase.auto",
  fields: [
    {
      kind: "boolean",
      id: "auto.moved",
      label: "auto.moved",
      visibleWhen: played,
      importance: "core",
    },
    {
      kind: "multiChoice",
      id: "auto.sources",
      label: "auto.sources",
      options: options("auto.sources", [
        "preload",
        "depot",
        "outpost",
        "neutralZone",
        "none",
      ]),
      visibleWhen: played,
      importance: "core",
    },
    {
      kind: "multiChoice",
      id: "auto.actions",
      label: "auto.actions",
      options: options("auto.actions", [
        "scoredHub",
        "crossedBump",
        "usedTrench",
        "disruptedOpponent",
        "climbed",
      ]),
      visibleWhen: played,
      importance: "detail",
    },
    {
      kind: "choice",
      id: "auto.climb",
      label: "auto.climb",
      options: options("auto.climb", ["none", "attemptFail", "level1"]),
      visibleWhen: played,
      importance: "core",
    },
    {
      kind: "rating",
      id: "auto.effectiveness",
      label: "auto.effectiveness",
      scale: 5,
      anchors: {
        low: "auto.effectiveness.low",
        high: "auto.effectiveness.high",
      },
      required: { modes: ["new"] },
      visibleWhen: played,
      importance: "core",
    },
  ],
} as const satisfies SectionDef
