// What the data-state hooks need from the running app: the db, the sync status mirror and whether
// the engine can sync right now. Provided once by the app shell (src/app), mocked in tests.
import { createContext, use, useSyncExternalStore } from "react"
import type { VScoutDB } from "@/lib/db/schema"
import type { ScopeInfoStore } from "@/lib/sync/scope-info"
import type { ExternalStore } from "@/lib/mqtt/external-store"
import type { SyncStatus } from "@/lib/sync/status-store"
import type { MutateDeps } from "@/lib/sync/mutate"
import type { BoardActionResult, OnlineResult } from "@/lib/sync/live-actions"
import type { BoardAction } from "@/lib/contracts/alliance-board"
import type { VideoManager } from "@/lib/media/videos"
import type {
  DemoEventCreated,
  DemoEventOptions,
} from "@/lib/contracts/demo-events"
import type { UserPatch } from "@/lib/sync/admin-actions"
import type { EventSettingsPatch } from "@/lib/sync/admin-writes"
import type { ZodType } from "zod"

/** Online-only requests (never the outbox): the live alliance board (ADR-032). */
export interface LiveActions {
  boardAction: (
    eventKey: string,
    baseRev: number,
    action: BoardAction
  ) => Promise<BoardActionResult>
  changePassword: (current: string, next: string) => Promise<OnlineResult>
  restore: (entity: string, id: string) => Promise<OnlineResult>
  refreshPitMap: (eventKey: string) => Promise<OnlineResult>
}

/** Settings → Admin (features/admin.md): online-only requests plus the queued singleton writes. */
export interface AdminActions {
  saveGuestAccess: (
    eventKey: string,
    next: { enabled: boolean; newCode: boolean }
  ) => Promise<OnlineResult>
  refreshUsers: () => Promise<OnlineResult>
  createUser: (input: {
    username: string
    displayName: string
    role: "admin" | "scouter"
  }) => Promise<
    { kind: "ok"; passphrase: string } | Exclude<OnlineResult, { kind: "ok" }>
  >
  patchUser: (userId: string, patch: UserPatch) => Promise<OnlineResult>
  revokeSessions: (userId: string) => Promise<OnlineResult>
  refreshAudit: (eventKey: string) => Promise<OnlineResult>
  fetchOptional: <T>(
    path: string,
    schema: ZodType<T>
  ) => Promise<
    | { kind: "ok"; value: T }
    | { kind: "missing" }
    | Exclude<OnlineResult, { kind: "ok" }>
  >
  patchEventSettings: (
    eventKey: string,
    patch: EventSettingsPatch
  ) => Promise<void>
  setTeamNumber: (teamNumber: number | null) => Promise<void>
  createDemoEvent: (
    options: DemoEventOptions
  ) => Promise<
    | { kind: "ok"; created: DemoEventCreated }
    | Exclude<OnlineResult, { kind: "ok" }>
  >
  deleteDemoEvent: (eventKey: string) => Promise<OnlineResult>
}

/** Who is reading: per-user queries (my entries, my prefs) and UX-only RBAC. */
export interface Viewer {
  userId: string
  role: "admin" | "scouter" | "guest"
}

export interface DataRuntime {
  db: VScoutDB
  scopeInfo: ScopeInfoStore
  /** online, signed in and not paused: a never-synced list is "loading", not "not synced" */
  canSync: () => boolean
  /** re-render when canSync may have changed */
  subscribeSync: (listener: () => void) => () => void
  /** ask the engine to fetch a record that isn't here yet (throttled by the caller) */
  requestSync?: () => void
  clockSkewMs?: () => number
  /** the engine's phase and last success, for the sync pill */
  syncStatus?: ExternalStore<SyncStatus>
  /** the signed-in user; a stable object until the session changes (re-read on subscribeSync) */
  viewer?: () => Viewer | null
  /** feature writes go through lib/sync/mutate with these deps */
  writer?: MutateDeps
  live?: LiveActions
  /** match videos on this device (HTTP list, OPFS bytes) */
  videos?: VideoManager
  admin?: AdminActions
}

export const DataRuntimeContext = createContext<DataRuntime | null>(null)

export function useDataRuntime(): DataRuntime {
  const runtime = use(DataRuntimeContext)
  if (!runtime) throw new Error("useDataRuntime outside DataRuntimeContext")
  return runtime
}

const NO_VIEWER = () => null

/** The signed-in user, or null (signed out, or a test runtime without one). */
export function useViewer(): Viewer | null {
  const runtime = useDataRuntime()
  return useSyncExternalStore(
    runtime.subscribeSync,
    runtime.viewer ?? NO_VIEWER,
    NO_VIEWER
  )
}

/** Write deps for lib/sync/mutate; throws when the runtime can't write (a bug, not a state). */
export function useWriter(): MutateDeps {
  const { writer } = useDataRuntime()
  if (!writer) throw new Error("useWriter: this runtime has no writer")
  return writer
}

export function useLiveActions(): LiveActions {
  const { live } = useDataRuntime()
  if (!live) throw new Error("useLiveActions: this runtime has no live actions")
  return live
}

export function useVideoManager(): VideoManager {
  const { videos } = useDataRuntime()
  if (!videos)
    throw new Error("useVideoManager: this runtime has no video manager")
  return videos
}

export function useAdminActions(): AdminActions {
  const { admin } = useDataRuntime()
  if (!admin)
    throw new Error("useAdminActions: this runtime has no admin actions")
  return admin
}
