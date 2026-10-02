// The global sync indicator (ui-patterns §7.1): glass, icon plus text, never color alone.
import {
  CircleX,
  CloudCheck,
  CloudOff,
  CloudUpload,
  RefreshCw,
  TriangleAlert,
} from "@/components/icons/icon"
import type { LucideIcon } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

export type SyncPillState =
  | { kind: "synced" }
  | { kind: "syncing" }
  | { kind: "pending"; count: number }
  | { kind: "offline" }
  | { kind: "conflict"; count: number }
  | { kind: "rejected"; count: number }

export interface SyncSummaryInput {
  online: boolean
  syncing: boolean
  pending: number
  conflicts: number
  rejected: number
}

/** Priority: conflict > rejected > offline > syncing > pending > synced. */
export function syncPillState(s: SyncSummaryInput): SyncPillState {
  if (s.conflicts > 0) return { kind: "conflict", count: s.conflicts }
  if (s.rejected > 0) return { kind: "rejected", count: s.rejected }
  if (!s.online) return { kind: "offline" }
  if (s.syncing) return { kind: "syncing" }
  if (s.pending > 0) return { kind: "pending", count: s.pending }
  return { kind: "synced" }
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

export function describeSyncPill(state: SyncPillState): {
  icon: LucideIcon
  text: string
  label: string
  tone: string
} {
  switch (state.kind) {
    case "synced":
      return {
        icon: CloudCheck,
        text: "",
        label: "All changes synced",
        tone: "text-success",
      }
    case "syncing":
      return {
        icon: RefreshCw,
        text: "Syncing…",
        label: "Syncing",
        tone: "text-foreground",
      }
    case "pending":
      return {
        icon: CloudUpload,
        text: `${state.count} waiting`,
        label: `${plural(state.count, "change", "changes")} waiting to sync`,
        tone: "text-foreground",
      }
    case "offline":
      return {
        icon: CloudOff,
        text: "Offline",
        label: "Offline",
        tone: "text-muted-foreground",
      }
    case "conflict":
      return {
        icon: TriangleAlert,
        text: plural(state.count, "conflict", "conflicts"),
        label: plural(state.count, "conflict", "conflicts"),
        tone: "text-conflict",
      }
    case "rejected":
      return {
        icon: CircleX,
        text: `${state.count} not saved`,
        label: `${plural(state.count, "change", "changes")} not saved`,
        tone: "text-destructive",
      }
  }
}

export function SyncPill({
  state,
  onSelect,
}: {
  state: SyncPillState
  onSelect: () => void
}) {
  const d = describeSyncPill(state)
  const Icon = d.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={d.label}
      className="hit-44 inline-flex min-h-9 items-center gap-1.5 rounded-full glass px-3 text-footnote font-medium"
    >
      <Icon
        aria-hidden
        size={16}
        className={cn(
          d.tone,
          state.kind === "syncing" && "motion-safe:animate-spin"
        )}
      />
      {d.text ? <span aria-hidden>{d.text}</span> : null}
    </button>
  )
}
