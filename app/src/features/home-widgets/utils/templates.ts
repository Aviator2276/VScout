// Home templates (features/home.md H4): ordered lists per breakpoint, picked so flow() leaves no gaps.
// Widgets the role can't use are skipped when a template applies.
import type { Breakpoint, GridItem } from "@/components/grid/grid-engine"
import { widgetMeta } from "@/config/widget-catalog"
import type { WidgetRole } from "@/types/widget"

type Entry = readonly [widget: string, w: number, h: number]
type Template = {
  id: string
  name: string
  adminOnly?: boolean
  lists: Record<Breakpoint, ReadonlyArray<Entry>>
}

const same = (list: ReadonlyArray<Entry>) => ({
  compact: list,
  regular: list,
  wide: list,
})

export const TEMPLATES: ReadonlyArray<Template> = [
  {
    id: "starter",
    name: "Starter",
    lists: {
      compact: [
        ["ourNextMatch", 4, 2],
        ["needsScouting", 4, 2],
        ["clock", 2, 2],
        ["announcements", 2, 2],
        ["resumeDrafts", 4, 2],
        ["rankings", 4, 3],
      ],
      regular: [
        ["ourNextMatch", 4, 2],
        ["clock", 2, 2],
        ["needsScouting", 4, 2],
        ["announcements", 2, 2],
        ["resumeDrafts", 6, 2],
        ["rankings", 6, 3],
      ],
      wide: [
        ["ourNextMatch", 4, 2],
        ["needsScouting", 4, 2],
        ["clock", 2, 2],
        ["announcements", 6, 2],
        ["resumeDrafts", 4, 3],
        ["rankings", 4, 3],
      ],
    },
  },
  {
    id: "scouter",
    name: "Scouter",
    lists: same([
      ["needsScouting", 4, 2],
      ["resumeDrafts", 4, 2],
      ["myCoverage", 2, 1],
      ["clock", 2, 1],
      ["announcements", 4, 2],
    ]),
  },
  {
    id: "strategist",
    name: "Strategist",
    lists: same([
      ["ourNextMatch", 4, 4],
      ["watchedTeams", 4, 2],
      ["announcements", 4, 2],
      ["rankings", 4, 3],
    ]),
  },
  {
    id: "pit",
    name: "Pit",
    lists: same([
      ["pitMap", 4, 4],
      ["ourNextMatch", 4, 2],
      ["recentMessages", 4, 2],
    ]),
  },
  {
    id: "admin",
    name: "Admin",
    adminOnly: true,
    lists: same([
      ["coverageOverview", 4, 2],
      ["needsScouting", 4, 2],
      ["announcements", 4, 2],
      ["rankings", 4, 3],
    ]),
  },
]

export function templatesFor(role: WidgetRole): ReadonlyArray<Template> {
  return TEMPLATES.filter((t) => !t.adminOnly || role === "admin")
}

/** A template's list for a breakpoint, with stable ids, skipping widgets the role can't use. */
export function templateList(
  templateId: string,
  bp: Breakpoint,
  role: WidgetRole
): Array<GridItem> {
  const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0]
  if (!t) return []
  return t.lists[bp]
    .filter(([widget]) => widgetMeta(widget)?.roles.includes(role) ?? false)
    .map(([widget, w, h]) => ({ id: `${t.id}-${widget}`, widget, w, h }))
}

export function templateName(templateId: string): string {
  return (
    (TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0])?.name ??
    "Starter"
  )
}
