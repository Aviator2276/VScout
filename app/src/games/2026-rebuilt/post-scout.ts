import { options } from "../kit/define-game"
import type { FormDef } from "../types"

// After quals: playoff readiness.
export const postForm = {
  id: "post",
  sections: [
    {
      id: "postScout",
      title: "postScout.title",
      fields: [
        {
          kind: "text",
          id: "postScout.changesSinceStart",
          label: "postScout.changesSinceStart",
          multiline: true,
          maxLength: 1000,
        },
        {
          kind: "text",
          id: "postScout.knownIssues",
          label: "postScout.knownIssues",
          multiline: true,
          maxLength: 1000,
          quickTags: options("postScout.knownIssues.tag", [
            "electrical",
            "mechanical",
            "software",
            "none",
          ]),
        },
        {
          kind: "text",
          id: "postScout.repairsDone",
          label: "postScout.repairsDone",
          multiline: true,
          maxLength: 1000,
        },
        {
          kind: "choice",
          id: "postScout.willingDefense",
          label: "postScout.willingDefense",
          options: options("postScout.willingDefense", [
            "yes",
            "preferNot",
            "no",
          ]),
        },
        {
          kind: "choice",
          id: "postScout.bestRole",
          label: "postScout.bestRole",
          options: options("postScout.bestRole", [
            "offense",
            "defense",
            "feeder",
            "flexible",
          ]),
        },
        {
          kind: "choice",
          id: "postScout.climbConfidence",
          label: "postScout.climbConfidence",
          options: options("postScout.climbConfidence", [
            "none",
            "level1",
            "level2",
            "level3",
          ]),
        },
        {
          kind: "boolean",
          id: "postScout.spareParts",
          label: "postScout.spareParts",
        },
        {
          kind: "text",
          id: "postScout.driveTeamNotes",
          label: "postScout.driveTeamNotes",
          multiline: true,
          maxLength: 1000,
        },
        {
          kind: "rating",
          id: "postScout.wouldPick",
          label: "postScout.wouldPick",
          scale: 5,
          anchors: {
            low: "postScout.wouldPick.low",
            high: "postScout.wouldPick.high",
          },
          modes: ["experienced"],
        },
      ],
    },
  ],
} as const satisfies FormDef
