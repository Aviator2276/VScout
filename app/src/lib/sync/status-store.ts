// Sync status for the UI (data-layer §10), read with useSyncExternalStore.
import { createStore } from "@/lib/mqtt/external-store"
import type { WritableStore } from "@/lib/mqtt/external-store"

export type SyncPhase =
  | "idle"
  | "pushing"
  | "pulling"
  | "bootstrapping"
  | "paused-auth"
  | "offline"
  | "error"

export interface SyncStatus {
  phase: SyncPhase
  bootstrap?: {
    scope: string
    entitiesDone: number
    entitiesTotal: number
    recordsApplied: number
  }
  lastSuccessAt?: number
  lastError?: { message: string; at: number }
  /** this tab holds the sync lock */
  leaderTab: boolean
}

export function createSyncStatusStore(): WritableStore<SyncStatus> {
  return createStore<SyncStatus>({ phase: "idle", leaderTab: false })
}
