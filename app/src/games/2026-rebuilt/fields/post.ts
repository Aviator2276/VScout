import { options } from "../../kit/define-game"
import type { SectionDef } from "../../types"

// Foul names are a draft until the owner reviews them against the 2026 manual (open question).
export const postSection = {
  id: "post",
  phase: "post",
  title: "phase.post",
  fields: [
    {
      kind: "multiChoice",
      id: "post.penalties",
      label: "post.penalties",
      options: options("post.penalties", [
        "none",
        "pinning",
        "protectedZone",
        "overBumper",
        "tooManyPieces",
        "other",
      ]),
      importance: "core",
    },
    {
      kind: "choice",
      id: "post.strategySwitch",
      label: "post.strategySwitch",
      options: options("post.strategySwitch", [
        "none",
        "adaptedWell",
        "adaptedPoorly",
      ]),
      importance: "detail",
    },
    {
      kind: "rating",
      id: "post.overall",
      label: "post.overall",
      scale: 5,
      anchors: { low: "post.overall.low", high: "post.overall.high" },
      importance: "core",
    },
    {
      kind: "text",
      id: "post.notes",
      label: "post.notes",
      multiline: true,
      maxLength: 1000,
      quickTags: options("post.notes.tag", [
        "fast",
        "slow",
        "greatDriver",
        "tippy",
        "jammed",
        "goodPartner",
        "aggressive",
        "smartPositioning",
      ]),
      importance: "core",
    },
  ],
} as const satisfies SectionDef
