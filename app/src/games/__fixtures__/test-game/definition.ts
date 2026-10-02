// A tiny fake season ("widgets" and "gizmos") for app tests, so features are proven to work with
// any game module (game-module.md §8). Not registered in the app registry.
import { z } from "zod"
import { defineGame, options } from "../../kit/define-game"
import { meanRating, reliabilityFromIncidents } from "../../kit/metrics"
import type { IncidentTaxonomy, MetricDef } from "../../types"

const incidents: IncidentTaxonomy = {
  types: [
    {
      value: "stopped",
      label: "inc.stopped",
      defaultCategory: "electrical",
      countsAgainstReliability: true,
    },
    {
      value: "fieldFault",
      label: "inc.fieldFault",
      defaultCategory: "field",
      countsAgainstReliability: false,
    },
  ],
  categories: options("inc.category", [
    "electrical",
    "mechanical",
    "field",
    "unknown",
  ]),
  lengths: [
    { value: "brief", label: "inc.length.brief", minSec: 0, maxSec: 5 },
    { value: "long", label: "inc.length.long", minSec: 5, maxSec: null },
  ],
  ignoreLengthsForReliability: ["brief"],
  resolutions: options("inc.resolution", ["recovered", "never"]),
  phases: ["auto", "teleop"],
}

const metrics: ReadonlyArray<MetricDef> = [
  {
    id: "reliability",
    label: "metric.reliability",
    description: "metric.reliability.desc",
    format: "percent",
    higherIsBetter: true,
    compute: reliabilityFromIncidents(incidents, {
      incidentsField: "incidents",
    }),
  },
  {
    id: "consistency",
    label: "metric.consistency",
    description: "metric.consistency.desc",
    format: "score5",
    higherIsBetter: true,
    compute: meanRating("teleop.widgetRating"),
  },
  {
    id: "defense",
    label: "metric.defense",
    description: "metric.defense.desc",
    format: "score5",
    higherIsBetter: true,
    compute: meanRating("teleop.defenseRating"),
  },
  {
    id: "autoEffectiveness",
    label: "metric.autoEffectiveness",
    description: "metric.autoEffectiveness.desc",
    format: "score5",
    higherIsBetter: true,
    compute: meanRating("auto.effectiveness"),
  },
]

const overrides = z.looseObject({
  widgetBonusThreshold: z.number().int().min(0).default(10),
})

export const game = defineGame({
  id: "2099-test-game",
  year: 2099,
  name: "game.name",
  schemaVersion: 2,
  match: { robotsPerAlliance: 3, stations: ["1", "2", "3"], totalSec: 150 },
  phases: [
    { kind: "pre", label: "phase.pre" },
    { kind: "auto", label: "phase.auto", durationSec: 15 },
    { kind: "teleop", label: "phase.teleop", durationSec: 135 },
    { kind: "post", label: "phase.post" },
  ],
  matchForm: {
    id: "match",
    sections: [
      {
        id: "pre",
        phase: "pre",
        title: "phase.pre",
        fields: [
          {
            kind: "boolean",
            id: "pre.noShow",
            label: "pre.noShow",
            importance: "core",
          },
        ],
      },
      {
        id: "auto",
        phase: "auto",
        title: "phase.auto",
        fields: [
          {
            kind: "rating",
            id: "auto.effectiveness",
            label: "auto.effectiveness",
            scale: 5,
            anchors: { low: "anchor.low", high: "anchor.high" },
            visibleWhen: { field: "pre.noShow", eq: false },
            required: { modes: ["new"] },
          },
        ],
      },
      {
        id: "teleop",
        phase: "teleop",
        title: "phase.teleop",
        fields: [
          {
            kind: "choice",
            id: "teleop.role",
            label: "teleop.role",
            options: options("teleop.role", ["offense", "defense"]),
            visibleWhen: { field: "pre.noShow", eq: false },
          },
          {
            kind: "rating",
            id: "teleop.widgetRating",
            label: "teleop.widgetRating",
            scale: 5,
            anchors: { low: "anchor.low", high: "anchor.high" },
            visibleWhen: { field: "teleop.role", eq: "offense" },
          },
          {
            kind: "rating",
            id: "teleop.defenseRating",
            label: "teleop.defenseRating",
            scale: 5,
            anchors: { low: "anchor.low", high: "anchor.high" },
            visibleWhen: { field: "teleop.role", eq: "defense" },
          },
          {
            kind: "count",
            id: "teleop.gizmos",
            label: "teleop.gizmos",
            min: 0,
            max: 10,
            modes: ["experienced"],
          },
          { kind: "incidents", id: "incidents", label: "incidents" },
        ],
      },
      {
        id: "post",
        phase: "post",
        title: "phase.post",
        fields: [
          {
            kind: "text",
            id: "post.notes",
            label: "post.notes",
            multiline: true,
            maxLength: 500,
            quickTags: options("post.tag", ["fast", "slow"]),
          },
        ],
      },
    ],
  },
  incidents,
  pitForm: {
    id: "pit",
    sections: [
      {
        id: "pit",
        title: "pit.title",
        fields: [
          {
            kind: "choice",
            id: "pit.gizmoGrabber",
            label: "pit.gizmoGrabber",
            options: options("pit.gizmoGrabber", ["none", "claw"]),
          },
        ],
      },
    ],
  },
  postForm: {
    id: "post",
    sections: [
      {
        id: "post",
        title: "postForm.title",
        fields: [
          {
            kind: "boolean",
            id: "postForm.willingDefense",
            label: "postForm.willingDefense",
          },
        ],
      },
    ],
  },
  capabilities: [
    {
      id: "grabber",
      label: "cap.grabber",
      source: { pitField: "pit.gizmoGrabber" },
      display: "badge",
    },
  ],
  scoringKeys: {
    tba: {
      alliance: { autoPoints: "autoPoints" },
      perRobot: { parked: { path: "parkRobot{n}", enumMap: "park" } },
    },
    statbotics: { teamEvent: { epa: "epa.total_points.mean" }, match: {} },
    enumMaps: { park: { Parked: "yes", None: "no" } },
    units: { teleopScoring: "units.widgets" },
  },
  metrics,
  validations: [],
  teamListColumns: [
    {
      id: "reliability",
      label: "metric.reliability",
      source: { metric: "reliability" },
      defaultVisible: true,
    },
    {
      id: "epa",
      label: "col.epa",
      source: { external: "epa" },
      defaultVisible: true,
    },
  ],
  prematchCard: [
    {
      id: "overview",
      title: "prematch.overview",
      show: [{ metric: "reliability" }],
    },
  ],
  picklistHints: { first: ["consistency"], second: ["defense"] },
  assets: { images: {}, icon: "" },
  labels: {
    en: {
      "game.name": "TEST GAME",
      "phase.pre": "Pre",
      "phase.auto": "Auto",
      "phase.teleop": "Teleop",
      "phase.post": "Post",
      "pre.noShow": "No show",
      "auto.effectiveness": "Auto effectiveness",
      "anchor.low": "Low",
      "anchor.high": "High",
      "teleop.role": "Role",
      "teleop.role.offense": "Offense",
      "teleop.role.defense": "Defense",
      "teleop.widgetRating": "Widget scoring",
      "teleop.defenseRating": "Defense",
      "teleop.gizmos": "Gizmos moved",
      incidents: "Incidents",
      "post.notes": "Notes",
      "post.tag.fast": "Fast",
      "post.tag.slow": "Slow",
      "inc.stopped": "Stopped",
      "inc.fieldFault": "Field fault",
      "inc.category.electrical": "Electrical",
      "inc.category.mechanical": "Mechanical",
      "inc.category.field": "Field",
      "inc.category.unknown": "Unknown",
      "inc.length.brief": "Brief",
      "inc.length.long": "Long",
      "inc.resolution.recovered": "Recovered",
      "inc.resolution.never": "Never recovered",
      "pit.title": "Pit",
      "pit.gizmoGrabber": "Gizmo grabber",
      "pit.gizmoGrabber.none": "None",
      "pit.gizmoGrabber.claw": "Claw",
      "postForm.title": "After quals",
      "postForm.willingDefense": "Willing to defend",
      "cap.grabber": "Grabber",
      "units.widgets": "widgets",
      "metric.reliability": "Reliability",
      "metric.reliability.desc": "Matches without a breakdown",
      "metric.reliability.badMatches": "Matches with a breakdown",
      "metric.reliability.electrical": "Electrical incidents",
      "metric.consistency": "Consistency",
      "metric.consistency.desc": "Scoring rating",
      "metric.defense": "Defense",
      "metric.defense.desc": "Defense rating",
      "metric.autoEffectiveness": "Auto",
      "metric.autoEffectiveness.desc": "Auto rating",
      "col.epa": "EPA",
      "prematch.overview": "Overview",
    },
  },
  migrations: {
    // v1 called the role field "teleop.job"
    1: ({ "teleop.job": job, ...rest }) =>
      job === undefined ? rest : { ...rest, "teleop.role": job },
  },
  bannedTerms: ["widget", "gizmo"],
  glossary: [
    {
      id: "widget",
      term: "Widget",
      short: "The test game's scoring piece.",
      category: "game",
      source: "game",
    },
  ],
  eventOverridesSchema: overrides,
  defaultsByEventType: {
    regional: { widgetBonusThreshold: 10 },
    district: { widgetBonusThreshold: 10 },
    dcmp: { widgetBonusThreshold: 20 },
    cmp: { widgetBonusThreshold: 30 },
    offseason: { widgetBonusThreshold: 10 },
  },
})
