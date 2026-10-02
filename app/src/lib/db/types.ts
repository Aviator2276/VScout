// Domain record shapes stored in Dexie (systems/data-layer.md §3–4). Times are epoch ms.
// Wire shapes live in lib/contracts; lib/api/adapters maps wire → these types (ADR-071).
// Phase 1 track 4 (data layer) adds the schema and tables around them.
import type { WireAllianceBoard } from "@/lib/contracts/alliance-board"
import type { WireComment } from "@/lib/contracts/comment"
import type { WireEvent, WireEventTeam, WireTeam } from "@/lib/contracts/event"
import type { WireEventSettings } from "@/lib/contracts/event-settings"
import type { WireMatch } from "@/lib/contracts/match"
import type { WireMediaAsset } from "@/lib/contracts/media"
import type { WireMessage } from "@/lib/contracts/message"
import type { WirePicklist, WirePicklistEntry } from "@/lib/contracts/picklist"
import type { WireReaction } from "@/lib/contracts/reaction"
import type {
  WireAllianceRank,
  WirePitScouting,
  WirePostScouting,
  WireScoutEntry,
} from "@/lib/contracts/scouting"
import type { WireUser } from "@/lib/contracts/user"
import type { UserSettingsDocument } from "@/lib/contracts/user-settings"

export type SyncState = "synced" | "pending" | "conflict" | "rejected"

/** Fields every server-known record carries. */
export interface ServerMeta {
  id: string
  /** server revision; 0 = created locally, never acknowledged */
  rev: number
  updatedAt: number
}

/** Author-owned data (ADR-004). */
export interface OwnedMeta extends ServerMeta {
  eventKey: string
  authorId: string
  createdAt: number
  /** set when an admin edited someone else's record */
  updatedBy?: string
  syncState: SyncState
  /** last local edit; equals updatedAt for records that came from the server */
  localUpdatedAt: number
}

/**
 * Omit for loose wire objects: zod's looseObject adds a string index signature, and a plain Omit
 * over it turns every known key into `unknown`. This drops the index signature first.
 */
type KnownOmit<T, TKeys extends PropertyKey> = {
  [
    P in keyof T as string extends P
      ? never
      : number extends P
        ? never
        : P extends TKeys
          ? never
          : P
  ]: T[P]
}

type Meta = "id" | "rev" | "updatedAt"
type OwnedWireMeta = Meta | "eventKey" | "authorId" | "createdAt" | "updatedBy"

// ---------- reference data (server-owned, read-only) ----------

export type EventRecord = ServerMeta &
  KnownOmit<WireEvent, Meta | "isDemo"> & { key: string; isDemo: boolean }

export type TeamRecord = ServerMeta & KnownOmit<WireTeam, Meta>

export type EventTeamRecord = ServerMeta &
  KnownOmit<
    WireEventTeam,
    Meta | "statsUpdatedAt" | "rank" | "rankingPoints" | "pitLocation"
  > & {
    rank: number | null
    rankingPoints: number | null
    pitLocation: string | null
    statsUpdatedAt: number | null
  }

export type MatchRecord = ServerMeta &
  KnownOmit<
    WireMatch,
    | Meta
    | "scheduledTime"
    | "predictedTime"
    | "predictedAt"
    | "actualTime"
    | "winningAlliance"
  > & {
    key: string
    scheduledTime: number | null
    predictedTime: number | null
    predictedAt: number | null
    actualTime: number | null
    winningAlliance: "red" | "blue" | null
    /** all six (or eight) team numbers, for the multi-entry index */
    teamNumbers: Array<number>
  }

export type UserRecord = ServerMeta & KnownOmit<WireUser, Meta>

export type TeamSettingsRecord = ServerMeta & {
  id: "team"
  teamNumber: number | null
  syncState: SyncState
}

export type UserSettingsRecord = ServerMeta &
  UserSettingsDocument & { userId: string; syncState: SyncState }

export type EventSettingsRecord = ServerMeta &
  KnownOmit<WireEventSettings, Meta | "guestAccess"> & {
    guestAccess: {
      enabled: boolean
      code: string | null
      rotatedAt: number | null
    }
    syncState: SyncState
  }

export type AllianceBoardRecord = ServerMeta &
  KnownOmit<WireAllianceBoard, Meta | "lockedAt" | "history"> & {
    lockedAt: number | null
    history: Array<
      KnownOmit<WireAllianceBoard["history"][number], "at"> & { at: number }
    >
  }

// ---------- owned data ----------

/** Set on ingest when the payload's (gameId, schemaVersion) is newer or unknown to this app. */
export interface GamePayloadFlags {
  unsupported?: true
}

export type ScoutEntryRecord = OwnedMeta &
  KnownOmit<WireScoutEntry, OwnedWireMeta> &
  GamePayloadFlags
export type PitScoutingRecord = OwnedMeta &
  KnownOmit<WirePitScouting, OwnedWireMeta> &
  GamePayloadFlags
export type PostScoutingRecord = OwnedMeta &
  KnownOmit<WirePostScouting, OwnedWireMeta> &
  GamePayloadFlags
export type AllianceRankRecord = OwnedMeta &
  KnownOmit<WireAllianceRank, OwnedWireMeta>
export type CommentRecord = OwnedMeta & KnownOmit<WireComment, OwnedWireMeta>
export type MessageRecord = OwnedMeta & KnownOmit<WireMessage, OwnedWireMeta>
export type ReactionRecord = OwnedMeta & KnownOmit<WireReaction, OwnedWireMeta>
export type PicklistRecord = OwnedMeta & KnownOmit<WirePicklist, OwnedWireMeta>
export type PicklistEntryRecord = OwnedMeta &
  KnownOmit<WirePicklistEntry, OwnedWireMeta>
export type MediaAssetRecord = OwnedMeta &
  KnownOmit<WireMediaAsset, OwnedWireMeta>

/** Domain record type per entity name (matches lib/contracts/entities.ts). */
export interface DomainRecords {
  event: EventRecord
  team: TeamRecord
  eventTeam: EventTeamRecord
  match: MatchRecord
  user: UserRecord
  userSettings: UserSettingsRecord
  teamSettings: TeamSettingsRecord
  scoutEntry: ScoutEntryRecord
  pitScouting: PitScoutingRecord
  postScouting: PostScoutingRecord
  comment: CommentRecord
  allianceRank: AllianceRankRecord
  message: MessageRecord
  reaction: ReactionRecord
  picklist: PicklistRecord
  picklistEntry: PicklistEntryRecord
  eventSettings: EventSettingsRecord
  allianceBoard: AllianceBoardRecord
  mediaAsset: MediaAssetRecord
}

// ---------- local tables (data-layer §4.1) ----------

export interface SessionRow {
  id: "current"
  userId: string
  username: string | null
  displayName: string
  role: "admin" | "scouter" | "guest"
  /** guest sessions are scoped to one event (ADR-073) */
  eventKey: string | null
  refreshExpiresAt: number
  status: "active" | "needs-reauth"
  lastVerifiedAt: number
}

export interface KvRow {
  key: string
  value: unknown
}

export interface DeviceSettingsRow {
  id: "device"
  activeEventKey?: string
  solidSurfaces: boolean
  haptics: boolean
  iosHapticsExperiment: boolean
  keepScreenAwake: boolean
  autoDownloadVideos: boolean
  pushSubscriptionId?: string
  transport: "auto" | "http-only" | "prefer-mqtt"
  /** a guest's preferences, same shape as userSettings, never synced (ADR-066) */
  guestPrefs?: Record<string, unknown>
}

export type OutboxKind = "create" | "update" | "delete" | "upload"
export type OutboxState = "queued" | "inflight" | "blocked" | "failed"

export interface OutboxOp {
  seq?: number
  /** UUIDv7 → Idempotency-Key */
  opId: string
  userId: string
  entity: string
  recordId: string
  /** `${entity}:${recordId}` */
  recordKey: string
  eventKey: string | null
  kind: OutboxKind
  /** recordKeys that must be done first (photo uploads before the pit entry) */
  dependsOn?: Array<string>
  state: OutboxState
  /** set on first attempt; resent verbatim on retry */
  sealedBody?: unknown
  baseRev?: number
  /** userSettings merge patches: the top-level keys this op changes (per-key LWW) */
  patchKeys?: Array<string>
  attempts: number
  nextAttemptAt: number
  lastError?: { status?: number; code?: string; message: string; at: number }
  createdAt: number
}

export interface SyncCursorRow {
  scope: string
  entity: string
  cursor: string | null
  lastPulledAt: number
  bootstrapState: "none" | "running" | "done"
  forbidden?: true
}

export interface TombstoneRow {
  entity: string
  id: string
  rev: number
  deletedAt: number
  eventKey: string | null
  syncState: SyncState
  /** local deletes keep the record so a rejected delete or Undo can restore it */
  snapshot?: unknown
}

export type ConflictKind =
  "rev-mismatch" | "deleted-remotely" | "duplicate" | "rejected" | "forbidden"

export interface ConflictRow {
  id: string
  entity: string
  recordId: string
  eventKey: string | null
  kind: ConflictKind
  source: "push" | "pull"
  detectedAt: number
  status: "open" | "resolved"
  resolvedAt?: number
  local: unknown
  /** the server record; null when deleted remotely */
  remote: unknown
  baseRev: number
  remoteRev: number | null
  serverErrors?: Array<{ path: string; code: string; message: string }>
  blockedOpIds: Array<string>
}

export interface DraftRow {
  /** the future record id */
  id: string
  userId: string
  kind: "match" | "pit" | "post" | "comment"
  eventKey: string
  context: { matchKey?: string; teamNumber?: number; station?: string }
  stage?: string
  values: Record<string, unknown>
  gameId: string
  schemaVersion: number
  needsReview?: true
  createdAt: number
  updatedAt: number
}

export interface LogRow {
  id?: number
  at: number
  level: "debug" | "info" | "warn" | "error"
  scope: string
  message: string
  data?: unknown
}
