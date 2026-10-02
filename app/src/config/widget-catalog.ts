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
    sizes: fixed([2, 2], [4, 2], [4, 4], [8, 4]),
    defaultSize: [4, 2],
    sizeLabels: {
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
    sizes: fixed([2, 2], [4, 2], [4, 3]),
    defaultSize: [4, 2],
    sizeLabels: { "2x2": "Small", "4x2": "Medium", "4x3": "Tall" },
    roles: SCOUTING,
  },
  {
    type: "clock",
    title: "Clock",
    description: "The time and the event day",
    sizes: fixed([1, 1], [2, 1], [2, 2]),
    defaultSize: [2, 1],
    sizeLabels: { "1x1": "Tiny", "2x1": "Small", "2x2": "Square" },
    roles: ALL,
  },
  {
    type: "announcements",
    title: "Announcements",
    description: "Latest from your admins",
    sizes: range(2, 8, 2, 6),
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
    defaultSize: [4, 3],
    roles: ALL,
  },
  {
    type: "watchedTeams",
    title: "Watched Teams",
    description: "Next match for each team you watch",
    sizes: range(2, 8, 2, 6),
    defaultSize: [4, 2],
    roles: ALL,
  },
  {
    type: "recentMessages",
    title: "Recent Messages",
    description: "The latest in event chat",
    sizes: range(2, 8, 2, 6),
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
    sizes: fixed([1, 1], [2, 1], [2, 2]),
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
