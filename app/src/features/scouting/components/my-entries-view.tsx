// My entries (scouting-forms.md S4): Drafts · Pending · Synced · Needs attention. A row opens the
// form (edit, or resume a draft); each row has its own Delete or Discard with a confirmation.
import { use, useState } from "react"
import { Segmented } from "@/components/controls/segmented"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { ClipboardList, Trash2 } from "@/components/icons/icon"
import { ListLinkContext } from "@/components/list/list"
import { ConfirmAlert } from "@/components/overlays/confirm-alert"
import { ConflictBadge, SyncBadge } from "@/components/sync/sync-badge"
import type { DataState } from "@/lib/db/react/data-state"
import { parseMatchKey, shortMatchLabel } from "@/utils/match-label"
import type { ResumeDraft } from "../api/get-recommendations"
import type { MyEntry } from "../api/get-my-entries"

export type MineSegment = "drafts" | "pending" | "synced" | "attention"

const EMPTY: Record<MineSegment, string> = {
  drafts: "No drafts",
  pending: "Nothing waiting to sync",
  synced: "You haven’t scouted yet. Pick a match to start.",
  attention: "Nothing needs attention",
}

const when = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
})

function title(
  kind: MyEntry["kind"],
  matchKey: string | null,
  team: number | null
): string {
  if (kind === "match") {
    const id = matchKey ? parseMatchKey(matchKey) : null
    return `${id ? shortMatchLabel(id) : "Match"} · ${team ?? ""}`
  }
  return `${kind === "pit" ? "Pit" : "Post"} · ${team ?? ""}`
}

function hrefFor(
  kind: MyEntry["kind"],
  matchKey: string | null,
  team: number | null
) {
  return kind === "match"
    ? `/scouting/match/${matchKey ?? ""}/${team ?? ""}`
    : `/scouting/${kind}/${team ?? ""}`
}

interface Row {
  key: string
  title: string
  href: string
  detail: string
  badge: React.ReactNode
  remove: { label: string; confirm: string; run: () => Promise<void> }
}

export function MyEntriesView({
  segment,
  onSegmentChange,
  entries,
  drafts,
  onDelete,
  onDiscard,
  onResolve,
}: {
  segment: MineSegment
  onSegmentChange: (s: MineSegment) => void
  entries: DataState<ReadonlyArray<MyEntry>>
  drafts: DataState<ReadonlyArray<ResumeDraft>>
  onDelete: (e: MyEntry) => Promise<void>
  onDiscard: (id: string) => Promise<void>
  /** opens the conflict sheet for a record */
  onResolve: (recordId: string) => void
}) {
  const renderLink = use(ListLinkContext)
  const [confirm, setConfirm] = useState<Row["remove"] | null>(null)

  const state: DataState<Array<Row>> = (() => {
    if (segment === "drafts") {
      if (drafts.status !== "success") return drafts
      return {
        status: "success",
        data: drafts.data.map((d) => ({
          key: d.id,
          title: title(
            d.kind === "comment" ? "match" : d.kind,
            d.matchKey,
            d.teamNumber
          ),
          href: hrefFor(
            d.kind === "comment" ? "match" : d.kind,
            d.matchKey,
            d.teamNumber
          ),
          detail: `Draft · ${when.format(d.updatedAt)}`,
          badge: null,
          remove: {
            label: "Discard Draft",
            confirm: "Discard this draft? Its answers will be lost.",
            run: () => onDiscard(d.id),
          },
        })),
      }
    }
    if (entries.status !== "success") return entries
    const pick = entries.data.filter((e) =>
      segment === "pending"
        ? e.syncState === "pending"
        : segment === "synced"
          ? e.syncState === "synced"
          : e.syncState === "conflict" || e.syncState === "rejected"
    )
    return {
      status: "success",
      data: pick.map((e) => ({
        key: e.id,
        title: title(e.kind, e.matchKey, e.teamNumber),
        href: hrefFor(e.kind, e.matchKey, e.teamNumber),
        detail: when.format(e.updatedAt),
        badge:
          segment === "attention" ? (
            <ConflictBadge onResolve={() => onResolve(e.id)} />
          ) : (
            <SyncBadge state={e.syncState} />
          ),
        remove: {
          label: "Delete",
          confirm: `Delete your entry for ${title(e.kind, e.matchKey, e.teamNumber)}? Others’ entries stay.`,
          run: () => onDelete(e),
        },
      })),
    }
  })()
  const shown: DataState<Array<Row>> =
    state.status === "success" && state.data.length === 0
      ? { status: "empty" }
      : state

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Show"
        value={segment}
        onValueChange={onSegmentChange}
        options={[
          { value: "drafts", label: "Drafts" },
          { value: "pending", label: "Pending" },
          { value: "synced", label: "Synced" },
          { value: "attention", label: "Attention" },
        ]}
      />
      <DataView state={shown} size="page">
        <DataView.Loading label="Loading your entries…">
          <SkeletonRows rows={4} rowClassName="h-14" />
        </DataView.Loading>
        <DataView.Empty icon={ClipboardList} title={EMPTY[segment]} />
        <DataView.Error title="Couldn’t load your entries." />
        <DataView.Success>
          {(rows: Array<Row>) => (
            <ul className="flex flex-col gap-2" aria-label="Entries">
              {rows.map((r) => (
                <li
                  key={r.key}
                  className="relative flex min-h-14 items-center gap-3 rounded-2xl bg-card ps-4 pe-1 shadow-xs"
                >
                  <span className="flex min-w-0 flex-1 flex-col py-2">
                    {renderLink({
                      href: r.href,
                      className: "text-body after:absolute after:inset-0",
                      children: r.title,
                    })}
                    <span className="text-footnote text-muted-foreground">
                      {r.detail}
                    </span>
                  </span>
                  <span className="relative z-10 flex items-center gap-1">
                    {r.badge}
                    <button
                      type="button"
                      aria-label={`${r.remove.label}: ${r.title}`}
                      onClick={() => setConfirm(r.remove)}
                      className="inline-flex size-11 items-center justify-center rounded-full text-destructive"
                    >
                      <Trash2 aria-hidden size={18} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DataView.Success>
      </DataView>
      <ConfirmAlert
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={
          confirm?.label === "Delete"
            ? "Delete this entry?"
            : "Discard this draft?"
        }
        description={confirm?.confirm ?? ""}
        confirmLabel={confirm?.label ?? "Delete"}
        cancelLabel="Cancel"
        tone="destructive"
        onConfirm={() => {
          const c = confirm
          setConfirm(null)
          if (c) void c.run()
        }}
      />
    </div>
  )
}
