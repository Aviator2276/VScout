// The Home widget catalog (features/home.md H5): sizes, defaults and roles per widget type. The
// components live in their owning features; src/app/home-widgets.tsx maps type → component.
import type { WidgetMeta } from "@/types/widget"

const ALL = ["admin", "scouter", "guest"] as const
const SCOUTING = ["admin", "scouter"] as const

const range = (minW: number, maxW: number, minH: number, maxH: number) =>
  ({ kind: "range", minW, maxW, minH, maxH }) as const
const fixed = (...sizes: Array<readonly [number, number]>) =>
  ({ kind: "fixed", sizes }) as const

export const WIDGETS: ReadonlyArray<WidgetMeta> = [
  {
    type: "ourNextMatch",
    title: "Our Next Match",
    description: "When we play next, with partners and opponents",
    sizes: fixed([4, 1], [2, 2], [4, 2], [4, 4], [8, 4]),
    defaultSize: [4, 2],
    sizeLabels: {
      "4x1": "Strip",
      "2x2": "Small",
      "4x2": "Medium",
      "4x4": "Large",
      "8x4": "Extra Large",
    },
    roles: ALL,
  },
  {
    type: "needsScouting",
    title: "Needs Scouting",
    description: "The robot to scout next",
    sizes: fixed([4, 1], [2, 2], [4, 2], [4, 3]),
    defaultSize: [4, 2],
    sizeLabels: {
      "4x1": "Strip",
      "2x2": "Small",
      "4x2": "Medium",
      "4x3": "Tall",
    },
    roles: SCOUTING,
  },
  {
    type: "clock",
    title: "Clock",
    description: "The time and the event day",
    sizes: fixed([1, 1], [2, 1], [1, 2], [2, 2], [4, 1]),
    defaultSize: [2, 1],
    sizeLabels: {
      "1x1": "Tiny",
      "2x1": "Small",
      "1x2": "Tall",
      "2x2": "Square",
      "4x1": "Strip",
    },
    settings: [
      { kind: "toggle", key: "seconds", label: "Show Seconds", default: false },
      { kind: "toggle", key: "hour24", label: "24-Hour Time", default: false },
      { kind: "toggle", key: "showDay", label: "Show the Day", default: true },
    ],
    roles: ALL,
  },
  {
    type: "announcements",
    title: "Announcements",
    description: "Latest from your admins",
    sizes: range(2, 8, 1, 6),
    settings: [
      {
        kind: "count",
        key: "count",
        label: "Show Up To",
        min: 1,
        max: 10,
        default: 10,
      },
      {
        kind: "toggle",
        key: "urgentOnly",
        label: "Urgent Only",
        default: false,
      },
    ],
    defaultSize: [4, 2],
    roles: ALL,
  },
  {
    type: "resumeDrafts",
    title: "Resume Drafts",
    description: "Forms you haven’t submitted",
    sizes: range(2, 8, 2, 6),
    defaultSize: [4, 2],
    roles: SCOUTING,
  },
  {
    type: "rankings",
    title: "Rankings",
    description: "The event’s standings",
    sizes: range(2, 8, 2, 8),
    settings: [
      {
        kind: "count",
        key: "rows",
        label: "Show Up To",
        min: 3,
        max: 24,
        default: 24,
      },
      { kind: "toggle", key: "showNames", label: "Team Names", default: true },
    ],
    defaultSize: [4, 3],
    roles: ALL,
  },
  {
    type: "watchedTeams",
    title: "Watched Teams",
    description: "Next match for each team you watch",
    sizes: range(2, 8, 1, 6),
    defaultSize: [4, 2],
    roles: ALL,
  },
  {
    type: "recentMessages",
    title: "Recent Messages",
    description: "The latest in event chat",
    sizes: range(2, 8, 1, 6),
    settings: [
      {
        kind: "count",
        key: "count",
        label: "Show Up To",
        min: 1,
        max: 12,
        default: 12,
      },
    ],
    defaultSize: [4, 2],
    roles: SCOUTING,
  },
  {
    type: "followedPicklist",
    title: "Followed Picklist",
    description: "Top of the team’s followed list",
    sizes: range(2, 8, 2, 6),
    defaultSize: [4, 3],
    roles: ALL,
  },
  {
    type: "liveAlliance",
    title: "Alliance Selection",
    description: "The live board during selection",
    sizes: fixed([4, 2], [4, 4], [8, 4]),
    defaultSize: [4, 2],
    roles: ALL,
  },
  {
    type: "myCoverage",
    title: "My Coverage",
    description: "How many robots you scouted",
    sizes: fixed([1, 1], [2, 1], [1, 2], [2, 2]),
    defaultSize: [2, 1],
    roles: SCOUTING,
  },
  {
    type: "coverageOverview",
    title: "Coverage Overview",
    description: "Scouting coverage of recent matches",
    sizes: fixed([4, 2], [4, 3], [8, 3]),
    defaultSize: [4, 2],
    roles: ["admin"],
  },
  {
    type: "pitMap",
    title: "Pit Map",
    description: "Where every team’s pit is",
    sizes: fixed([4, 4], [6, 4], [8, 4], [8, 6]),
    defaultSize: [4, 4],
    roles: ALL,
  },
]

export function widgetMeta(type: string): WidgetMeta | undefined {
  return WIDGETS.find((w) => w.type === type)
}

/** A widget's setting from its config, or the catalog default (bad values fall back too). */
export function widgetSetting(
  type: string,
  config: Readonly<Record<string, unknown>> | undefined,
  key: string
): boolean | number | undefined {
  const def = widgetMeta(type)?.settings?.find((d) => d.key === key)
  if (!def) return undefined
  const v = config?.[key]
  if (def.kind === "toggle") return typeof v === "boolean" ? v : def.default
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(def.max, Math.max(def.min, Math.round(v)))
    : def.default
}
export const settingOn = (
  type: string,
  config: Readonly<Record<string, unknown>> | undefined,
  key: string
) => widgetSetting(type, config, key) === true
export const settingCount = (
  type: string,
  config: Readonly<Record<string, unknown>> | undefined,
  key: string
) => {
  const v = widgetSetting(type, config, key)
  return typeof v === "number" ? v : Infinity
}
