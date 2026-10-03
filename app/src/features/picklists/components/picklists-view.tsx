// P1 (scout-tab.md A): every picklist with its owner, the followed one pinned on top, All · Mine,
// search by list or owner name, and a New Picklist sheet for scouters and admins.
import { use, useState } from "react"
import { Button } from "@/components/controls/button"
import { Segmented } from "@/components/controls/segmented"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { SearchField } from "@/components/form/search-field"
import { TextField } from "@/components/form/text-field"
import { ClipboardList, SearchX } from "@/components/icons/icon"
import { ListLinkContext } from "@/components/list/list"
import { Sheet } from "@/components/overlays/sheet"
import { SyncBadge } from "@/components/sync/sync-badge"
import type { DataState } from "@/lib/db/react/data-state"
import type { PicklistSummary, Purpose } from "../api/get-picklists"

export const PURPOSE_LABEL: Record<Purpose, string> = {
  first: "First pick",
  second: "Second pick",
  dnp: "Do not pick",
  custom: "Custom",
}

const ago = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

export function PicklistsView({
  state,
  owner,
  onOwnerChange,
  canCreate,
  now,
}: {
  state: DataState<ReadonlyArray<PicklistSummary>>
  owner: "all" | "me"
  onOwnerChange: (o: "all" | "me") => void
  canCreate: boolean
  now: number
}) {
  const renderLink = use(ListLinkContext)
  const [q, setQ] = useState("")
  const needle = q.trim().toLowerCase()
  const shown: DataState<ReadonlyArray<PicklistSummary>> =
    state.status === "success"
      ? (() => {
          const data = state.data.filter(
            (p) =>
              (owner === "all" || p.mine) &&
              (!needle ||
                p.name.toLowerCase().includes(needle) ||
                p.ownerName.toLowerCase().includes(needle))
          )
          return data.length ? { ...state, data } : { status: "empty" }
        })()
      : state
  const filtered = state.status === "success" && state.data.length > 0
  return (
    <div className="flex flex-col gap-2">
      <SearchField
        landmark="Picklists"
        label="Search picklists"
        placeholder="List or owner name"
        value={q}
        onValueChange={setQ}
      />
      {canCreate ? (
        <Segmented
          label="Whose lists"
          value={owner}
          onValueChange={onOwnerChange}
          options={[
            { value: "all", label: "All" },
            { value: "me", label: "Mine" },
          ]}
        />
      ) : null}
      <DataView state={shown} size="page">
        <DataView.Loading label="Loading picklists…">
          <SkeletonRows rows={4} rowClassName="h-16" />
        </DataView.Loading>
        <DataView.Empty
          {...(filtered
            ? {
                icon: SearchX,
                title: needle
                  ? `No picklists match ‘${q.trim()}’`
                  : "You have no picklists yet",
              }
            : {
                icon: ClipboardList,
                title: canCreate
                  ? "No picklists yet. Create one."
                  : "No picklists yet",
              })}
        />
        <DataView.Missing
          not-synced={{
            title: "Picklists not downloaded yet",
            description: "Connect to download them.",
          }}
        />
        <DataView.Error title="Couldn’t load picklists." />
        <DataView.Success>
          {(lists: ReadonlyArray<PicklistSummary>) => (
            <ul className="flex flex-col gap-2" aria-label="Picklists">
              {lists.map((p) => (
                <li
                  key={p.id}
                  className="relative flex min-h-16 items-center gap-3 rounded-2xl bg-card px-4 py-2 shadow-xs active:bg-muted"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    {renderLink({
                      href: `/scout/picklists/${p.id}`,
                      className:
                        "truncate text-body font-medium after:absolute after:inset-0",
                      children: p.name,
                    })}
                    <span className="text-footnote text-muted-foreground">
                      {PURPOSE_LABEL[p.purpose]} · {p.ownerName} · {p.teamCount}{" "}
                      {p.teamCount === 1 ? "team" : "teams"} ·{" "}
                      {ago.format(
                        Math.round((p.updatedAt - now) / 3_600_000),
                        "hour"
                      )}
                    </span>
                  </div>
                  {p.followed ? (
                    <span className="rounded-full bg-primary px-2 text-caption-1 font-semibold text-primary-foreground">
                      Followed
                    </span>
                  ) : null}
                  <SyncBadge state={p.syncState} />
                </li>
              ))}
            </ul>
          )}
        </DataView.Success>
      </DataView>
    </div>
  )
}

export function NewPicklistSheet({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (input: { name: string; purpose: Purpose }) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [purpose, setPurpose] = useState<Purpose>("first")
  const [busy, setBusy] = useState(false)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <Sheet.Content title="New Picklist">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            setBusy(true)
            void onCreate({ name, purpose }).finally(() => {
              setBusy(false)
              setName("")
            })
          }}
        >
          <TextField
            label="Name"
            value={name}
            onValueChange={setName}
            maxLength={80}
            autoCapitalize="words"
          />
          <Segmented
            label="Purpose"
            value={purpose}
            onValueChange={setPurpose}
            options={(["first", "second", "dnp", "custom"] as const).map(
              (v) => ({
                value: v,
                label: PURPOSE_LABEL[v],
              })
            )}
          />
          <Button type="submit" size="large" disabled={busy || !name.trim()}>
            Create Picklist
          </Button>
        </form>
      </Sheet.Content>
    </Sheet>
  )
}
