// P2 (scout-tab.md A): one picklist. The owner reorders (drag, or Move Up / Move Down), removes
// with Undo, and writes a reason per team; everyone else reads it and can copy it. Compare mode
// shows how each team sits in another list. Picked teams are struck through during selection.
import { useState } from "react"
import type { ReactNode } from "react"
import { Button } from "@/components/controls/button"
import { DataView } from "@/components/data-view/data-view"
import { SkeletonRows } from "@/components/data-view/skeleton-rows"
import { SearchField } from "@/components/form/search-field"
import { TextArea } from "@/components/form/text-field"
import { GlossaryText } from "@/components/glossary/glossary-text"
import {
  Check,
  ChevronDown,
  ClipboardList,
  Plus,
  Trash2,
} from "@/components/icons/icon"
import { SortableList } from "@/components/list/sortable-list"
import { Sheet } from "@/components/overlays/sheet"
import { SyncBadge } from "@/components/sync/sync-badge"
import type { DataState } from "@/lib/db/react/data-state"
import { cn } from "@/lib/utils"
import type { PicklistDetail, PicklistRow } from "../api/get-picklists"
import { PURPOSE_LABEL } from "./picklists-view"

export interface Chip {
  label: string
  value: string
}

export interface PicklistEditorProps {
  state: DataState<PicklistDetail>
  /** two metric chips per team from game.picklistHints */
  chips: (teamNumber: number) => ReadonlyArray<Chip>
  /** compare mode: + moved up in this list relative to the other, − down, null = not there */
  deltas: ReadonlyMap<number, number | null> | null
  picked: ReadonlySet<number>
  onMove: (from: number, to: number) => void
  onRemove: (row: PicklistRow) => void
  onReason: (row: PicklistRow) => void
  onAddTeams: () => void
  /** tap a team: a preview sheet (owner), composed by the route */
  onPreview?: (teamNumber: number) => void
  /** viewers (scouters/admins) copy someone else's list */
  onCopy?: (() => void) | undefined
  /** owner's ⋯ actions etc., composed by the route */
  footer?: ReactNode
}

function Delta({ d }: { d: number | null | undefined }) {
  if (d === undefined) return null
  if (d === null)
    return <span className="text-caption-1 text-muted-foreground">new</span>
  if (d === 0)
    return <span className="text-caption-1 text-muted-foreground">=</span>
  return (
    <span
      className={cn(
        "text-caption-1 font-semibold",
        d > 0 ? "text-success" : "text-destructive"
      )}
    >
      {d > 0 ? `▲${d}` : `▼${-d}`}
    </span>
  )
}

export function PicklistEditor(p: PicklistEditorProps) {
  return (
    <DataView state={p.state} size="page">
      <DataView.Loading label="Loading picklist…">
        <SkeletonRows rows={6} rowClassName="h-16" />
      </DataView.Loading>
      <DataView.Missing
        not-found={{ title: "This picklist was deleted" }}
        not-synced={{
          title: "This picklist isn’t on this device yet",
          description: "Connect to download it.",
        }}
      />
      <DataView.Error title="Couldn’t load this picklist." />
      <DataView.Success>
        {(d: PicklistDetail) => (
          <div className="flex flex-col gap-3">
            <p className="text-subhead text-muted-foreground">
              {PURPOSE_LABEL[d.list.purpose]} · {d.ownerName}
              {d.followed ? " · Followed by the team" : ""}
            </p>
            {d.rows.length === 0 ? (
              <div
                role="status"
                className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"
              >
                <ClipboardList aria-hidden size={40} />
                <p className="text-headline text-foreground">No teams yet</p>
                {d.mine ? (
                  <p className="text-subhead">
                    Add the teams you’d pick, best first.
                  </p>
                ) : null}
              </div>
            ) : (
              <SortableList
                label={`${d.list.name}, in order`}
                items={d.rows}
                disabled={!d.mine}
                onMove={p.onMove}
                renderItem={(row, { handleProps, index, dragging }) => {
                  const done = p.picked.has(row.teamNumber)
                  return (
                    <div
                      className={cn(
                        "flex min-h-16 items-center gap-2 rounded-2xl bg-card py-2 ps-2 pe-1 shadow-xs",
                        dragging && "shadow-lg ring-2 ring-primary"
                      )}
                    >
                      <button
                        type="button"
                        aria-label={
                          d.mine ? `Reorder ${row.teamNumber}` : undefined
                        }
                        aria-hidden={d.mine ? undefined : true}
                        tabIndex={d.mine ? 0 : -1}
                        className="flex w-8 shrink-0 touch-none justify-center font-heading text-subhead text-muted-foreground tabular-nums"
                        {...handleProps}
                      >
                        {index + 1}
                      </button>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span
                          className={cn(
                            "flex items-center gap-2",
                            done && "line-through opacity-60"
                          )}
                        >
                          {p.onPreview ? (
                            <button
                              type="button"
                              aria-label={`Preview ${row.teamNumber} ${row.nickname}`}
                              onClick={() => p.onPreview?.(row.teamNumber)}
                              className="flex min-w-0 items-center gap-2 text-start active:opacity-60"
                            >
                              <span className="font-heading text-headline tabular-nums">
                                {row.teamNumber}
                              </span>
                              <span className="truncate text-subhead">
                                {row.nickname}
                              </span>
                            </button>
                          ) : (
                            <>
                              <span className="font-heading text-headline tabular-nums">
                                {row.teamNumber}
                              </span>
                              <span className="truncate text-subhead">
                                {row.nickname}
                              </span>
                            </>
                          )}
                          {done ? (
                            <span className="sr-only">(picked)</span>
                          ) : null}
                          {p.deltas ? (
                            <Delta d={p.deltas.get(row.teamNumber)} />
                          ) : null}
                        </span>
                        <span className="flex flex-wrap gap-1 text-caption-1 text-muted-foreground">
                          {p.chips(row.teamNumber).map((c) => (
                            <span
                              key={c.label}
                              className="rounded bg-muted px-1"
                            >
                              {c.label} {c.value}
                            </span>
                          ))}
                          <SyncBadge state={row.syncState} />
                        </span>
                        {row.reason ? (
                          <button
                            type="button"
                            disabled={!d.mine}
                            onClick={() => p.onReason(row)}
                            className="line-clamp-2 text-left text-footnote"
                          >
                            <GlossaryText>{row.reason}</GlossaryText>
                          </button>
                        ) : d.mine ? (
                          <button
                            type="button"
                            onClick={() => p.onReason(row)}
                            className="min-h-8 text-left text-footnote text-primary"
                          >
                            Add a Reason
                          </button>
                        ) : null}
                      </div>
                      {d.mine ? (
                        <div className="flex shrink-0 items-center">
                          <button
                            type="button"
                            aria-label={`Move ${row.teamNumber} up`}
                            disabled={index === 0}
                            onClick={() => p.onMove(index, index - 1)}
                            className="inline-flex size-11 items-center justify-center rounded-full text-primary disabled:opacity-30"
                          >
                            <ChevronDown
                              aria-hidden
                              size={20}
                              className="rotate-180"
                            />
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${row.teamNumber} down`}
                            disabled={index === d.rows.length - 1}
                            onClick={() => p.onMove(index, index + 1)}
                            className="inline-flex size-11 items-center justify-center rounded-full text-primary disabled:opacity-30"
                          >
                            <ChevronDown aria-hidden size={20} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${row.teamNumber}`}
                            onClick={() => p.onRemove(row)}
                            className="inline-flex size-11 items-center justify-center rounded-full text-destructive"
                          >
                            <Trash2 aria-hidden size={18} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )
                }}
              />
            )}
            {d.mine ? (
              <Button size="large" variant="secondary" onClick={p.onAddTeams}>
                <Plus aria-hidden size={18} /> Add Teams
              </Button>
            ) : p.onCopy ? (
              <Button size="large" variant="secondary" onClick={p.onCopy}>
                Copy to My Lists
              </Button>
            ) : null}
            {p.footer}
          </div>
        )}
      </DataView.Success>
    </DataView>
  )
}

export function AddTeamsSheet({
  open,
  onOpenChange,
  teams,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** teams not on the list yet */
  teams: ReadonlyArray<{ teamNumber: number; nickname: string }>
  onAdd: (teams: Array<number>) => Promise<void>
}) {
  const [q, setQ] = useState("")
  const [chosen, setChosen] = useState<ReadonlyArray<number>>([])
  const needle = q.trim().toLowerCase()
  const list = teams.filter(
    (t) =>
      !needle ||
      String(t.teamNumber).startsWith(needle) ||
      t.nickname.toLowerCase().includes(needle)
  )
  const toggle = (n: number) =>
    setChosen((c) => (c.includes(n) ? c.filter((x) => x !== n) : [...c, n]))
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <Sheet.Content title="Add Teams" detent="large" closeLabel="Done">
        <SearchField
          landmark="Teams to add"
          label="Find a team"
          placeholder="Number or name"
          value={q}
          onValueChange={setQ}
        />
        {list.length === 0 ? (
          <p
            role="status"
            className="py-6 text-center text-subhead text-muted-foreground"
          >
            {teams.length === 0
              ? "Every team is on this list"
              : `No team matches ‘${q.trim()}’`}
          </p>
        ) : (
          <ul aria-label="Teams" className="flex flex-col">
            {list.map((t) => {
              const on = chosen.includes(t.teamNumber)
              return (
                <li key={t.teamNumber}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(t.teamNumber)}
                    className="flex min-h-12 w-full items-center gap-3 border-b border-border/60 px-1 text-left"
                  >
                    <span className="w-14 font-heading text-headline tabular-nums">
                      {t.teamNumber}
                    </span>
                    <span className="flex-1 truncate text-subhead">
                      {t.nickname}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full border",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border"
                      )}
                    >
                      {on ? <Check size={14} /> : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="sticky bottom-0 bg-surface-grouped pt-3">
          <Button
            size="large"
            disabled={chosen.length === 0}
            onClick={() => {
              const add = [...chosen]
              setChosen([])
              void onAdd(add)
            }}
          >
            {chosen.length === 0
              ? "Choose Teams"
              : `Add ${chosen.length} ${chosen.length === 1 ? "Team" : "Teams"}`}
          </Button>
        </div>
      </Sheet.Content>
    </Sheet>
  )
}

export function ReasonSheet({
  row,
  onOpenChange,
  onSave,
}: {
  row: PicklistRow | null
  onOpenChange: (open: boolean) => void
  onSave: (reason: string) => Promise<void>
}) {
  return (
    <Sheet open={row !== null} onOpenChange={onOpenChange}>
      {row ? (
        <Sheet.Content title={`Why ${row.teamNumber}?`} closeLabel="Close">
          <ReasonForm key={row.id} initial={row.reason} onSave={onSave} />
        </Sheet.Content>
      ) : null}
    </Sheet>
  )
}

function ReasonForm({
  initial,
  onSave,
}: {
  initial: string
  onSave: (r: string) => Promise<void>
}) {
  const [text, setText] = useState(initial)
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave(text)
      }}
    >
      <TextArea
        label="Reason"
        value={text}
        onValueChange={setText}
        rows={4}
        maxLength={500}
      />
      <Button type="submit" size="large">
        Save Reason
      </Button>
    </form>
  )
}
