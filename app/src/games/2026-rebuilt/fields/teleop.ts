import { options } from "../../kit/define-game"
import type { SectionDef } from "../../types"

const played = { field: "pre.noShow", eq: false } as const

export const teleopSection = {
  id: "teleop",
  phase: "teleop",
  title: "phase.teleop",
  fields: [
    {
      kind: "choice",
      id: "teleop.role",
      label: "teleop.role",
      options: options("teleop.role", [
        "offense",
        "defense",
        "feeder",
        "mixed",
        "idle",
      ]),
      required: { modes: ["new"] },
      visibleWhen: played,
      importance: "core",
    },
    {
      kind: "rating",
      id: "teleop.scoringRating",
      label: "teleop.scoringRating",
      scale: 5,
      allowNA: true,
      anchors: {
        low: "teleop.scoringRating.low",
        high: "teleop.scoringRating.high",
      },
      visibleWhen: { field: "teleop.role", in: ["offense", "mixed"] },
      importance: "core",
    },
    {
      kind: "rating",
      id: "teleop.accuracy",
      label: "teleop.accuracy",
      scale: 3,
      allowNA: true,
      anchors: {
        low: "teleop.accuracy.low",
        mid: "teleop.accuracy.mid",
        high: "teleop.accuracy.high",
      },
      visibleWhen: { field: "teleop.role", in: ["offense", "mixed"] },
      importance: "detail",
    },
    {
      kind: "choice",
      id: "teleop.inactiveHubBehavior",
      label: "teleop.inactiveHubBehavior",
      options: options("teleop.inactiveHubBehavior", [
        "collected",
        "defended",
        "fed",
        "waited",
        "keptShooting",
      ]),
      visibleWhen: played,
      importance: "core",
    },
    {
      kind: "multiChoice",
      id: "teleop.travel",
      label: "teleop.travel",
      options: options("teleop.travel", ["trench", "bump"]),
      visibleWhen: played,
      importance: "detail",
    },
    {
      kind: "rating",
      id: "teleop.defenseRating",
      label: "teleop.defenseRating",
      scale: 5,
      anchors: {
        low: "teleop.defenseRating.low",
        high: "teleop.defenseRating.high",
      },
      visibleWhen: { field: "teleop.role", in: ["defense", "mixed"] },
      importance: "core",
    },
    {
      kind: "choice",
      id: "teleop.wasDefended",
      label: "teleop.wasDefended",
      options: options("teleop.wasDefended", [
        "no",
        "handledWell",
        "struggled",
      ]),
      visibleWhen: played,
      importance: "detail",
    },
    {
      kind: "rating",
      id: "teleop.driverSkill",
      label: "teleop.driverSkill",
      scale: 5,
      anchors: {
        low: "teleop.driverSkill.low",
        high: "teleop.driverSkill.high",
      },
      modes: ["experienced"],
      visibleWhen: played,
      importance: "detail",
    },
    {
      kind: "incidents",
      id: "incidents",
      label: "incidents",
      help: "incidents.help",
      importance: "core",
    },
  ],
} as const satisfies SectionDef
