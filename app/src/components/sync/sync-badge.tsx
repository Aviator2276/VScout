// Overlays on success content (data-states.md): pending sync, conflict, stale data, refreshing.
// Each pairs an icon with text, never color alone (HIG Color).
import type { SyncState } from "@/lib/db/types"
import {
  CircleAlert,
  CloudOff,
  RefreshCw,
  TriangleAlert,
} from "@/components/icons/icon"
import { cn } from "@/lib/utils"

const PILL =
  "inline-flex min-h-6 items-center gap-1 rounded-full px-2 text-caption-1 font-medium"

/** A record's local sync state. Synced records show nothing. */
export function SyncBadge({ state }: { state: SyncState }) {
  switch (state) {
    case "synced":
      return null
    case "pending":
      return (
        <span className={cn(PILL, "bg-warning/15 text-foreground")}>
          <RefreshCw aria-hidden size={12} className="text-warning" />
          Waiting to sync
        </span>
      )
    case "conflict":
      return (
        <span className={cn(PILL, "bg-conflict/15 text-foreground")}>
          <CircleAlert aria-hidden size={12} className="text-conflict" />
          Needs review
        </span>
      )
    case "rejected":
      return (
        <span className={cn(PILL, "bg-destructive/15 text-foreground")}>
          <TriangleAlert aria-hidden size={12} className="text-destructive" />
          Not saved
        </span>
      )
  }
}

/** "Offline · updated 4 min ago" above cached content. `now` comes from a ticker (render stays pure). */
export function StaleNote({
  updatedAt,
  offline,
  now,
}: {
  updatedAt: number | undefined
  offline: boolean
  now: number
}) {
  const ago = updatedAt !== undefined ? formatAgo(now - updatedAt) : null
  const text = [
    offline ? "Offline" : "Not up to date",
    ago ? `updated ${ago}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <p
      role="status"
      className="flex items-center gap-1.5 text-footnote text-muted-foreground"
    >
      <CloudOff aria-hidden size={14} />
      {text}
    </p>
  )
}

/** A quiet indicator while fresher data loads behind visible content (never a full skeleton). */
export function RefreshingIndicator() {
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1 text-footnote text-muted-foreground"
    >
      <RefreshCw aria-hidden size={12} className="animate-spin" />
      Updating…
    </span>
  )
}

/** Entry point to the conflict sheet for one record. */
export function ConflictBadge({ onResolve }: { onResolve: () => void }) {
  return (
    <button
      type="button"
      onClick={onResolve}
      className={cn(PILL, "hit-44 bg-conflict/15 text-foreground")}
    >
      <CircleAlert aria-hidden size={12} className="text-conflict" />
      Review changes
    </button>
  )
}

export function formatAgo(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 1) return "just now"
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? "yesterday" : `${d} days ago`
}
