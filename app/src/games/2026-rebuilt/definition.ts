// 2026 REBUILT. The match form content is BETA (owner, 2026-10-01): field ids are append-only,
// and any form change bumps schemaVersion (game-module.md §6).
import { defineGame } from "../kit/define-game"
import fieldImage from "./assets/field.svg?url"
import { capabilities } from "./capabilities"
import { autoSection } from "./fields/auto"
import { endgameSection } from "./fields/endgame"
import { postSection } from "./fields/post"
import { preSection } from "./fields/pre"
import { teleopSection } from "./fields/teleop"
import { glossary } from "./help/glossary"
import { guides } from "./help/guides"
import { incidents } from "./incidents"
import { en } from "./labels/en"
import { metrics } from "./metrics"
import { migrations } from "./migrations"
import { defaultsByEventType, eventOverridesSchema } from "./overrides"
import { phases } from "./phases"
import { pitForm } from "./pit"
import { postForm } from "./post-scout"
import { scoringKeys } from "./scoring-keys"
import terms from "./terms.json"
import { validations } from "./validations"

export const game = defineGame({
  id: "2026-rebuilt",
  year: 2026,
  name: "game.name",
  schemaVersion: 1,
  match: { robotsPerAlliance: 3, stations: ["1", "2", "3"], totalSec: 160 },
  phases,
  matchForm: {
    id: "match",
    sections: [
      preSection,
      autoSection,
      teleopSection,
      endgameSection,
      postSection,
    ],
  },
  incidents,
  pitForm,
  postForm,
  capabilities,
  scoringKeys,
  metrics,
  validations,
  teamListColumns: [
    {
      id: "reliability",
      label: "metric.reliability",
      source: { metric: "reliability" },
      defaultVisible: true,
    },
    {
      id: "consistency",
      label: "metric.consistency",
      source: { metric: "consistency" },
      defaultVisible: true,
    },
    {
      id: "epa",
      label: "col.epa",
      source: { external: "epa" },
      defaultVisible: true,
    },
    {
      id: "autoScoring",
      label: "col.autoScoring",
      source: { external: "autoScoring" },
      defaultVisible: false,
    },
  ],
  prematchCard: [
    {
      id: "overview",
      title: "prematch.overview",
      show: [
        { metric: "reliability" },
        { metric: "autoEffectiveness" },
        { external: "epa" },
      ],
    },
    {
      id: "capabilities",
      title: "prematch.capabilities",
      show: [
        { capability: "climbMax" },
        { capability: "fitsTrench" },
        { field: "teleop.role", summary: "mode" },
      ],
    },
  ],
  detailPage: {
    matchSummary: [
      { field: "auto.effectiveness", label: "summary.auto" },
      { field: "teleop.scoringRating", label: "summary.scoring" },
      { field: "endgame.climbResult", label: "summary.climb" },
      { field: "incidents", label: "summary.stops" },
    ],
    prediction: { external: "epa" },
  },
  picklistHints: {
    first: ["consistency", "autoEffectiveness", "climbMax"],
    second: ["defense", "reliability", "fitsTrench"],
  },
  assets: {
    images: {
      field: {
        src: fieldImage,
        width: 1600,
        height: 800,
        alt: "pre.startZone",
      },
    },
    icon: "",
  },
  labels: { en },
  migrations,
  bannedTerms: terms.terms,
  glossary,
  guides,
  eventOverridesSchema,
  defaultsByEventType,
})
