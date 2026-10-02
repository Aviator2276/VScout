// Trailing nav-bar items on /teams (teams.md T1): the grouped Sort pull-down with an order group, the
// Filter button, and the two sheets (`?sheet=filters`, `?sheet=columns`). Every game-specific label
// comes from the game module (ADR-009).
import { ChipGroup } from "@/components/controls/chip-group"
import { Segmented } from "@/components/controls/segmented"
import { ToolbarButton } from "@/components/controls/toolbar-button"
import { ArrowDownUp, ListFilter } from "@/components/icons/icon"
import { List } from "@/components/list/list"
import { PullDownMenu, menuGroup } from "@/components/overlays/menu"
import { Sheet } from "@/components/overlays/sheet"
import { t } from "@/games/kit/labels"
import type { GameDefinition } from "@/games/types"
import { activeFilterCount } from "../types/teams-search"
import type { TeamsSearch } from "../types/teams-search"
import type { Column } from "../utils/columns"
import { naturalDirection } from "../utils/team-list"
import type { TeamsPatch } from "./team-list-view"
import { sortLabel } from "./team-list-view"

export function TeamsToolbar({
  game,
  search,
  onSearchChange,
  canScout,
}: {
  game: GameDefinition
  search: TeamsSearch
  onSearchChange: (patch: TeamsPatch) => void
  canScout: boolean
}) {
  const setSort = (sort: string) => onSearchChange({ sort, dir: undefined })
  const externals = Object.keys(game.scoringKeys.statbotics.teamEvent)
  const groups = [
    menuGroup({
      label: "Standing",
      name: "Standing",
      options: ["rank", "number", "name"].map((k) => ({
        value: k,
        label: sortLabel(game, k),
      })),
      value: search.sort,
      onValueChange: setSort,
    }),
    menuGroup({
      label: "Metrics",
      name: "Metrics",
      options: game.metrics.map((m) => ({
        value: m.id,
        label: t(game, m.label),
      })),
      value: search.sort,
      onValueChange: setSort,
    }),
    menuGroup({
      label: "External",
      name: "External",
      options: externals.map((k) => ({ value: k, label: sortLabel(game, k) })),
      value: search.sort,
      onValueChange: setSort,
    }),
    ...(canScout
      ? [
          menuGroup({
            label: "Scouting",
            name: "Scouting",
            options: ["pit", "scouted"].map((k) => ({
              value: k,
              label: sortLabel(game, k),
            })),
            value: search.sort,
            onValueChange: setSort,
          }),
        ]
      : []),
    menuGroup<"asc" | "desc">({
      name: "Order",
      options: [
        { value: "asc", label: "Ascending" },
        { value: "desc", label: "Descending" },
      ],
      value: search.dir ?? naturalDirection(game, search.sort),
      onValueChange: (dir) => onSearchChange({ dir }),
    }),
  ]
  return (
    <>
      <PullDownMenu
        label="Sort"
        trigger={<ArrowDownUp aria-hidden size={22} />}
        groups={groups}
      />
      <ToolbarButton
        label="Filter"
        badge={activeFilterCount(search)}
        onClick={() => onSearchChange({ sheet: "filters" })}
      >
        <ListFilter aria-hidden size={22} />
      </ToolbarButton>
    </>
  )
}

const DRIVETRAINS = [
  { value: "swerve", label: "Swerve" },
  { value: "tank", label: "Tank" },
  { value: "mecanum", label: "Mecanum" },
  { value: "other", label: "Other" },
  { value: "unknown", label: "Unknown" },
] as const
type Drivetrain = (typeof DRIVETRAINS)[number]["value"]

function Group({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-6">
      <h3 className="mb-1.5 px-4 text-footnote text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

export function TeamFilterSheet({
  game,
  search,
  onSearchChange,
  canScout,
}: {
  game: GameDefinition
  search: TeamsSearch
  onSearchChange: (patch: TeamsPatch) => void
  canScout: boolean
}) {
  const caps = game.capabilities.filter((c) => c.display === "badge")
  return (
    <Sheet
      open={search.sheet === "filters"}
      onOpenChange={(open) => {
        if (!open) onSearchChange({ sheet: undefined })
      }}
    >
      <Sheet.Content title="Filters" closeLabel="Done">
        <button
          type="button"
          className="min-h-11 text-body text-primary"
          onClick={() =>
            onSearchChange({
              watched: undefined,
              pit: "any",
              coverage: "any",
              drivetrain: undefined,
              cap: undefined,
              capSource: "either",
              ranked: "any",
            })
          }
        >
          Reset
        </button>
        <List.Section title="Show">
          <List.Toggle
            title="Watched Teams"
            checked={search.watched === true}
            onCheckedChange={(on) =>
              onSearchChange({ watched: on || undefined })
            }
          />
          {canScout ? (
            <List.Toggle
              title="Under-Scouted"
              checked={search.coverage === "under-target"}
              onCheckedChange={(on) =>
                onSearchChange({ coverage: on ? "under-target" : "any" })
              }
            />
          ) : null}
        </List.Section>
        {canScout ? (
          <Group title="Pit Scouting">
            <Segmented
              label="Pit scouting"
              value={search.pit}
              onValueChange={(pit) => onSearchChange({ pit })}
              options={[
                { value: "any", label: "Any" },
                { value: "none", label: "None" },
                { value: "partial", label: "No Photos" },
                { value: "full", label: "Done" },
              ]}
            />
          </Group>
        ) : null}
        <Group title="Ranking">
          <Segmented
            label="Ranking"
            value={search.ranked}
            onValueChange={(ranked) => onSearchChange({ ranked })}
            options={[
              { value: "any", label: "Any" },
              { value: "top8", label: "Top 8" },
              { value: "top16", label: "Top 16" },
            ]}
          />
        </Group>
        <Group title="Drivetrain">
          <ChipGroup<Drivetrain>
            label="Drivetrain"
            options={DRIVETRAINS}
            value={search.drivetrain ?? []}
            onValueChange={(d) =>
              onSearchChange({ drivetrain: d.length ? d : undefined })
            }
          />
        </Group>
        {caps.length > 0 ? (
          <Group title="Capabilities">
            <ChipGroup
              label="Capabilities"
              options={caps.map((c) => ({
                value: c.id,
                label: t(game, c.label),
              }))}
              value={search.cap ?? []}
              onValueChange={(cap) =>
                onSearchChange({ cap: cap.length ? cap : undefined })
              }
            />
            {search.cap?.length ? (
              <div className="mt-3">
                <Segmented
                  label="Capability source"
                  value={search.capSource}
                  onValueChange={(capSource) => onSearchChange({ capSource })}
                  options={[
                    { value: "either", label: "Either" },
                    { value: "claimed", label: "Pit Says" },
                    { value: "observed", label: "Seen in Match" },
                  ]}
                />
              </div>
            ) : null}
          </Group>
        ) : null}
      </Sheet.Content>
    </Sheet>
  )
}

export function ColumnsSheet({
  open,
  onOpenChange,
  available,
  chosen,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  available: ReadonlyArray<Column>
  chosen: ReadonlyArray<Column>
  onChange: (ids: Array<string>) => void
}) {
  const ids = chosen.map((c) => c.id)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <Sheet.Content
        title="Columns"
        description="Choose 2 to 4 values to show on each row."
        closeLabel="Done"
      >
        <ChipGroup
          label="Columns"
          options={available.map((c) => ({
            value: c.id,
            label: c.label,
            disabled: ids.length >= 4,
          }))}
          value={ids}
          onValueChange={(next) => {
            if (next.length >= 2 && next.length <= 4) onChange(next)
          }}
        />
        <p className="mt-3 text-footnote text-muted-foreground">
          {ids.length} of 4 chosen. At least 2 stay on.
        </p>
      </Sheet.Content>
    </Sheet>
  )
}
