// Trailing nav-bar items on /matches (matches.md M1): the Sort pull-down and the Filter button,
// plus the filter sheet (`?sheet=filters`, medium detent, Reset + Done, applies live).
import { Segmented } from "@/components/controls/segmented"
import { ToolbarButton } from "@/components/controls/toolbar-button"
import { ArrowDownUp, ListFilter } from "@/components/icons/icon"
import { List } from "@/components/list/list"
import { PullDownMenu, menuGroup } from "@/components/overlays/menu"
import { Sheet } from "@/components/overlays/sheet"
import { activeFilterCount } from "../types/matches-search"
import type { MatchesSearch, MatchesSort } from "../types/matches-search"
import type { SearchPatch } from "./match-list-view"

function sortOptions(canScout: boolean) {
  return [
    { value: "schedule" as const, label: "Schedule" },
    { value: "recent" as const, label: "Most Recent" },
    ...(canScout
      ? [{ value: "least-scouted" as const, label: "Least Scouted" }]
      : []),
  ]
}

export function MatchesToolbar({
  search,
  onSearchChange,
  canScout,
}: {
  search: MatchesSearch
  onSearchChange: (patch: SearchPatch) => void
  canScout: boolean
}) {
  return (
    <>
      <PullDownMenu
        label="Sort"
        trigger={<ArrowDownUp aria-hidden size={22} />}
        groups={[
          menuGroup<MatchesSort>({
            name: "Sort by",
            options: sortOptions(canScout),
            value: search.sort,
            onValueChange: (sort) => onSearchChange({ sort }),
          }),
        ]}
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

export function MatchFilterSheet({
  search,
  onSearchChange,
  canScout,
  hasTeamNumber,
}: {
  search: MatchesSearch
  onSearchChange: (patch: SearchPatch) => void
  canScout: boolean
  hasTeamNumber: boolean
}) {
  const reset = () =>
    onSearchChange({
      ours: undefined,
      watched: undefined,
      status: "any",
      scouted: "any",
      level: "all",
      team: undefined,
      video: undefined,
      sort: "schedule",
    })
  return (
    <Sheet
      open={search.sheet === "filters"}
      onOpenChange={(open) => {
        if (!open) onSearchChange({ sheet: undefined })
      }}
    >
      <Sheet.Content title="Filters" closeLabel="Done">
        <div className="flex justify-start">
          <button
            type="button"
            onClick={reset}
            className="min-h-11 text-body text-primary"
          >
            Reset
          </button>
        </div>
        <List.Section
          title="Show"
          footer={
            hasTeamNumber ? undefined : "No team number yet. Ask an admin."
          }
        >
          <List.Toggle
            title="Our Matches"
            checked={search.ours === true}
            disabled={!hasTeamNumber}
            onCheckedChange={(on) => onSearchChange({ ours: on || undefined })}
          />
          <List.Toggle
            title="Watched Teams"
            checked={search.watched === true}
            onCheckedChange={(on) =>
              onSearchChange({ watched: on || undefined })
            }
          />
          <List.Toggle
            title="Downloaded Videos Only"
            checked={search.video === true}
            onCheckedChange={(on) => onSearchChange({ video: on || undefined })}
          />
        </List.Section>
        <FilterGroup title="Status">
          <Segmented
            label="Status"
            value={search.status}
            onValueChange={(status) => onSearchChange({ status })}
            options={[
              { value: "any", label: "Any" },
              { value: "upcoming", label: "Upcoming" },
              { value: "played", label: "Played" },
            ]}
          />
        </FilterGroup>
        <FilterGroup title="Level">
          <Segmented
            label="Level"
            value={search.level}
            onValueChange={(level) => onSearchChange({ level })}
            options={[
              { value: "all", label: "All" },
              { value: "qm", label: "Quals" },
              { value: "playoff", label: "Playoffs" },
            ]}
          />
        </FilterGroup>
        {canScout ? (
          <FilterGroup title="Scouted">
            <Segmented
              label="Scouted"
              value={search.scouted}
              onValueChange={(scouted) => onSearchChange({ scouted })}
              options={[
                { value: "any", label: "Any" },
                { value: "none", label: "Gaps" },
                { value: "partial", label: "Partly" },
                { value: "full", label: "Full" },
              ]}
            />
          </FilterGroup>
        ) : null}
        <FilterGroup title="Sort">
          <Segmented
            label="Sort"
            value={search.sort}
            onValueChange={(sort) => onSearchChange({ sort })}
            options={sortOptions(canScout)}
          />
        </FilterGroup>
      </Sheet.Content>
    </Sheet>
  )
}

function FilterGroup({
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
