import { options } from "../kit/define-game"
import type { FormDef } from "../types"

// Season-specific pit fields only; drivetrain, weight and size are the app's RobotProfile.
export const pitForm = {
  id: "pit",
  sections: [
    {
      id: "pit",
      title: "pit.title",
      fields: [
        { kind: "boolean", id: "pit.fitsTrench", label: "pit.fitsTrench" },
        { kind: "boolean", id: "pit.crossesBump", label: "pit.crossesBump" },
        {
          kind: "count",
          id: "pit.capacity",
          label: "pit.capacity",
          min: 0,
          max: 60,
        },
        {
          kind: "choice",
          id: "pit.shooter",
          label: "pit.shooter",
          options: options("pit.shooter", [
            "fixed",
            "adjustableHood",
            "turret",
            "none",
          ]),
        },
        {
          kind: "choice",
          id: "pit.intake",
          label: "pit.intake",
          options: options("pit.intake", ["overBumper", "underBumper", "none"]),
        },
        {
          kind: "multiChoice",
          id: "pit.intakeSources",
          label: "pit.intakeSources",
          options: options("pit.intakeSources", ["ground", "outpost", "depot"]),
        },
        {
          kind: "choice",
          id: "pit.climbMax",
          label: "pit.climbMax",
          options: options("pit.climbMax", [
            "none",
            "level1",
            "level2",
            "level3",
          ]),
        },
        {
          kind: "text",
          id: "pit.autoRoutines",
          label: "pit.autoRoutines",
          multiline: true,
          maxLength: 500,
          quickTags: options("pit.autoRoutines.tag", [
            "scores",
            "depot",
            "outpost",
            "climb",
            "disrupt",
          ]),
        },
        {
          kind: "multiChoice",
          id: "pit.vision",
          label: "pit.vision",
          options: options("pit.vision", ["autoAim", "poseEstimation", "none"]),
        },
        {
          kind: "rating",
          id: "pit.wiringQuality",
          label: "pit.wiringQuality",
          scale: 3,
          anchors: {
            low: "pit.wiringQuality.low",
            high: "pit.wiringQuality.high",
          },
        },
        {
          kind: "rating",
          id: "pit.robustness",
          label: "pit.robustness",
          scale: 3,
          anchors: { low: "pit.robustness.low", high: "pit.robustness.high" },
        },
        {
          kind: "choice",
          id: "pit.preferredRole",
          label: "pit.preferredRole",
          options: options("pit.preferredRole", [
            "offense",
            "defense",
            "feeder",
            "flexible",
          ]),
        },
        {
          kind: "text",
          id: "pit.notes",
          label: "pit.notes",
          multiline: true,
          maxLength: 1000,
        },
      ],
    },
  ],
} as const satisfies FormDef
