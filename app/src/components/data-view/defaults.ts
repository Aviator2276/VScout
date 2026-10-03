// Default icon and copy per state (ui-design-system §13, data-states.md). Features override per use.
import type { LucideIcon } from "@/components/icons/icon"
import {
  CloudOff,
  FileQuestion,
  Inbox,
  Lock,
  MousePointerClick,
  SearchX,
  TriangleAlert,
} from "@/components/icons/icon"
import type { MissingReason } from "@/lib/db/react/data-state"

export interface StateCopy {
  icon: LucideIcon
  title: string
  description?: string
}

export const IDLE: StateCopy = {
  icon: MousePointerClick,
  title: "Choose something to get started",
}
export const LOADING_LABEL = "Loading…"
export const EMPTY: StateCopy = { icon: Inbox, title: "Nothing here yet" }
export const ERROR: StateCopy = {
  icon: TriangleAlert,
  title: "Something went wrong. Try again.",
}
export const RETRY_LABEL = "Try Again"

export const MISSING: Record<MissingReason, StateCopy> = {
  "not-found": {
    icon: SearchX,
    title: "This doesn't exist",
    description: "It may have been deleted.",
  },
  "not-synced": {
    icon: CloudOff,
    title: "Not on this device yet",
    description: "It will appear when this device syncs.",
  },
  "not-scouted": { icon: FileQuestion, title: "Not scouted yet" },
  forbidden: { icon: Lock, title: "You don't have access to this" },
}

/** Loading UI appears only after this delay, so fast reads don't flash (data-states.md). */
export const LOADING_DELAY_MS = 150
