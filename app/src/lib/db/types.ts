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

type Meta = "id" | "rev" | "updatedAt"
type OwnedWireMeta = Meta | "eventKey" | "authorId" | "createdAt" | "updatedBy"

// ---------- reference data (server-owned, read-only) ----------

export type EventRecord = ServerMeta &
  Omit<WireEvent, Meta | "isDemo"> & { key: string; isDemo: boolean }

export type TeamRecord = ServerMeta & Omit<WireTeam, Meta>

export type EventTeamRecord = ServerMeta &
  Omit<
    WireEventTeam,
    Meta | "statsUpdatedAt" | "rank" | "rankingPoints" | "pitLocation"
  > & {
    rank: number | null
    rankingPoints: number | null
    pitLocation: string | null
    statsUpdatedAt: number | null
  }

export type MatchRecord = ServerMeta &
  Omit<
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

export type UserRecord = ServerMeta & Omit<WireUser, Meta>

export type TeamSettingsRecord = ServerMeta & {
  id: "team"
  teamNumber: number | null
  syncState: SyncState
}

export type UserSettingsRecord = ServerMeta &
  UserSettingsDocument & { userId: string; syncState: SyncState }

export type EventSettingsRecord = ServerMeta &
  Omit<WireEventSettings, Meta | "guestAccess"> & {
    guestAccess: {
      enabled: boolean
      code: string | null
      rotatedAt: number | null
    }
    syncState: SyncState
  }

export type AllianceBoardRecord = ServerMeta &
  Omit<WireAllianceBoard, Meta | "lockedAt" | "history"> & {
    lockedAt: number | null
    history: Array<
      Omit<WireAllianceBoard["history"][number], "at"> & { at: number }
    >
  }

// ---------- owned data ----------

export type ScoutEntryRecord = OwnedMeta & Omit<WireScoutEntry, OwnedWireMeta>
export type PitScoutingRecord = OwnedMeta & Omit<WirePitScouting, OwnedWireMeta>
export type PostScoutingRecord = OwnedMeta &
  Omit<WirePostScouting, OwnedWireMeta>
export type AllianceRankRecord = OwnedMeta &
  Omit<WireAllianceRank, OwnedWireMeta>
export type CommentRecord = OwnedMeta & Omit<WireComment, OwnedWireMeta>
export type MessageRecord = OwnedMeta & Omit<WireMessage, OwnedWireMeta>
export type ReactionRecord = OwnedMeta & Omit<WireReaction, OwnedWireMeta>
export type PicklistRecord = OwnedMeta & Omit<WirePicklist, OwnedWireMeta>
export type PicklistEntryRecord = OwnedMeta &
  Omit<WirePicklistEntry, OwnedWireMeta>
export type MediaAssetRecord = OwnedMeta & Omit<WireMediaAsset, OwnedWireMeta>

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
