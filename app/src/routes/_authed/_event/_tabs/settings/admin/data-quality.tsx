import { Link, createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { useAdminCoverage } from "@/app/admin-coverage"
import { Button } from "@/components/controls/button"
import { Segmented } from "@/components/controls/segmented"
import { Switch } from "@/components/controls/switch"
import { DataView } from "@/components/data-view/data-view"
import { CircleCheck, ClipboardList } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { List } from "@/components/list/list"
import { activeGame } from "@/config/game"
import { useUserNames } from "@/features/admin/api/get-admin"
import {
  useMarkReviewed,
  useValidationFlags,
} from "@/features/admin/api/get-flags"
import type { FlagsView } from "@/features/admin/api/get-flags"
import type { CoverageSummary } from "@/features/admin/utils/coverage"
import { fieldLabels } from "@/features/admin/utils/field-labels"
import { cn } from "@/lib/utils"
import { parseMatchKey, shortMatchLabel } from "@/utils/match-label"

export const Route = createFileRoute(
  "/_authed/_event/_tabs/settings/admin/data-quality"
)({
  validateSearch: z.object({
    tab: z.enum(["coverage", "flags"]).optional().catch(undefined),
    missing: z.boolean().optional().catch(undefined),
  }),
  component: DataQuality,
})

const STATIONS = ["Red 1", "Red 2", "Red 3", "Blue 1", "Blue 2", "Blue 3"]
const labels = fieldLabels(activeGame)

// AD4: coverage of played matches and validation flags against TBA.
function DataQuality() {
  const { event } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const tab = search.tab ?? "coverage"
  return (
    <StackPage
      title="Data Quality"
      leading={<NavBackButton parentHref="/settings/admin" label="Admin" />}
    >
      <div className="mt-2">
        <Segmented
          label="Data quality view"
          value={tab}
          onValueChange={(t) =>
            void navigate({ search: (p) => ({ ...p, tab: t }), replace: true })
          }
          options={[
            { value: "coverage", label: "Coverage" },
            { value: "flags", label: "Flags" },
          ]}
        />
      </div>
      {tab === "coverage" ? (
        <Coverage
          eventKey={event.key}
          missingOnly={search.missing === true}
          onMissingOnly={(m) =>
            void navigate({
              search: (p) => ({ ...p, missing: m || undefined }),
              replace: true,
            })
          }
        />
      ) : (
        <Flags eventKey={event.key} />
      )}
    </StackPage>
  )
}

function Coverage({
  eventKey,
  missingOnly,
  onMissingOnly,
}: {
  eventKey: string
  missingOnly: boolean
  onMissingOnly: (m: boolean) => void
}) {
  const state = useAdminCoverage(eventKey)
  const shown =
    state.status === "success" && state.data.rows.length === 0
      ? ({ status: "empty" } as const)
      : state
  return (
    <DataView state={shown} size="page">
      <DataView.Empty
        icon={ClipboardList}
        title="No matches have been played yet"
      />
      <DataView.Error title="Couldn’t load coverage." />
      <DataView.Success>
        {(c: CoverageSummary) => {
          const rows = missingOnly
            ? c.rows.filter((r) => r.missing > 0)
            : c.rows
          return (
            <>
              <div className="my-3 flex items-center justify-between px-1">
                <p className="text-subhead">
                  {c.percent}% of {c.robots} robots scouted
                </p>
                <div className="flex items-center gap-2 text-subhead">
                  <span aria-hidden>Missing only</span>
                  <Switch
                    label="Missing only"
                    checked={missingOnly}
                    onCheckedChange={onMissingOnly}
                  />
                </div>
              </div>
              <table className="w-full text-center text-subhead tabular-nums">
                <caption className="sr-only">
                  Entries per robot in played matches
                </caption>
                <thead>
                  <tr className="text-footnote text-muted-foreground">
                    <th scope="col" className="py-1 text-start">
                      Match
                    </th>
                    {STATIONS.map((s) => (
                      <th key={s} scope="col">
                        {s.replace("Red ", "R").replace("Blue ", "B")}
                        <span className="sr-only">{s}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-t border-border">
                      <th scope="row" className="py-1 text-start font-normal">
                        <Link
                          to="/matches/$matchKey"
                          params={{ matchKey: r.key }}
                          className="text-primary"
                        >
                          {r.label}
                        </Link>
                      </th>
                      {r.counts.map((n, i) => (
                        <td
                          key={i}
                          className={cn(
                            "py-1",
                            r.teams[i] === undefined
                              ? "text-muted-foreground"
                              : n === 0
                                ? "bg-destructive/15 font-semibold text-destructive"
                                : n >= 2
                                  ? "font-semibold"
                                  : undefined
                          )}
                        >
                          {r.teams[i] === undefined ? "–" : n}
                          <span className="sr-only">{` entries for ${r.teams[i] ?? "no team"}`}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground">
                  Every played robot has an entry.
                </p>
              ) : null}
            </>
          )
        }}
      </DataView.Success>
    </DataView>
  )
}

function Flags({ eventKey }: { eventKey: string }) {
  const state = useValidationFlags(eventKey)
  const review = useMarkReviewed(eventKey)
  const names = useUserNames()
  return (
    <DataView state={state} size="page">
      <DataView.Error title="Couldn’t check entries against TBA." />
      <DataView.Success>
        {(v: FlagsView) => (
          <>
            {v.missingBreakdowns > 0 ? (
              <p
                role="status"
                className="mt-3 rounded-xl bg-muted px-3 py-2 text-footnote"
              >
                TBA hasn’t posted details for {v.missingBreakdowns}{" "}
                {v.missingBreakdowns === 1 ? "match" : "matches"} yet.
              </p>
            ) : null}
            {v.open.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CircleCheck
                  aria-hidden
                  size={32}
                  className="text-muted-foreground"
                />
                <p className="text-body">
                  No validation flags. Scouted data matches TBA.
                </p>
              </div>
            ) : (
              <List.Section
                footer={v.reviewed > 0 ? `${v.reviewed} reviewed` : undefined}
              >
                {v.open.map((f) => {
                  const id = parseMatchKey(f.matchKey)
                  return (
                    <List.Row
                      key={f.id}
                      title={`${id ? shortMatchLabel(id) : f.matchKey} · ${f.teamNumber} · ${labels.field(f.field)}`}
                      subtitle={`Scouted ${labels.value(f.field, f.scouted)}, TBA ${labels.value(f.field, f.tba)} · ${names.get(f.authorId) ?? "Unknown"}`}
                      detail={
                        <Button
                          variant="plain"
                          onClick={() => void review(f.id)}
                        >
                          Mark Reviewed
                        </Button>
                      }
                    />
                  )
                })}
              </List.Section>
            )}
          </>
        )}
      </DataView.Success>
    </DataView>
  )
}
