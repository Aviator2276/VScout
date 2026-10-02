// The typed Dexie database (data-layer §4). Open it through db.ts, never `new Dexie()` elsewhere.
import Dexie from "dexie"
import type { Table } from "dexie"
import { registerVersions } from "./migrations/register"
import type {
  AllianceBoardRecord,
  AllianceRankRecord,
  CommentRecord,
  ConflictRow,
  DeviceSettingsRow,
  DraftRow,
  EventRecord,
  EventSettingsRecord,
  EventTeamRecord,
  KvRow,
  LogRow,
  MediaUploadRow,
  MediaVideoRow,
  MatchRecord,
  MediaAssetRecord,
  MessageRecord,
  OutboxOp,
  PicklistEntryRecord,
  PicklistRecord,
  PitScoutingRecord,
  PostScoutingRecord,
  ReactionRecord,
  ScoutEntryRecord,
  SessionRow,
  SyncCursorRow,
  TeamRecord,
  TeamSettingsRecord,
  TombstoneRow,
  UserRecord,
  UserSettingsRecord,
} from "./types"

/** Tables whose rows aren't modelled yet (media downloads, sims, audit): Phase 4+ types them. */
type LooseRow = Record<string, unknown>

export class VScoutDB extends Dexie {
  session!: Table<SessionRow, "current">
  kv!: Table<KvRow, string>
  deviceSettings!: Table<DeviceSettingsRow, "device">
  userSettings!: Table<UserSettingsRecord, string>
  teamSettings!: Table<TeamSettingsRecord, "team">
  users!: Table<UserRecord, string>

  events!: Table<EventRecord, string>
  teams!: Table<TeamRecord, number>
  eventTeams!: Table<EventTeamRecord, string>
  matches!: Table<MatchRecord, string>

  scoutEntries!: Table<ScoutEntryRecord, string>
  pitScouting!: Table<PitScoutingRecord, string>
  postScouting!: Table<PostScoutingRecord, string>
  allianceRanks!: Table<AllianceRankRecord, string>
  comments!: Table<CommentRecord, string>
  messages!: Table<MessageRecord, string>
  reactions!: Table<ReactionRecord, string>
  picklists!: Table<PicklistRecord, string>
  picklistEntries!: Table<PicklistEntryRecord, string>
  eventSettings!: Table<EventSettingsRecord, string>
  allianceBoards!: Table<AllianceBoardRecord, string>
  allianceSims!: Table<LooseRow, string>
  adminAudit!: Table<LooseRow, string>

  mediaVideos!: Table<MediaVideoRow, string>
  mediaAssets!: Table<MediaAssetRecord, string>
  mediaUploads!: Table<MediaUploadRow, string>

  outbox!: Table<OutboxOp, number>
  syncCursors!: Table<SyncCursorRow, [string, string]>
  tombstones!: Table<TombstoneRow, [string, string]>
  conflicts!: Table<ConflictRow, string>
  drafts!: Table<DraftRow, string>
  logs!: Table<LogRow, number>

  constructor(name: string) {
    super(name)
    registerVersions(this)
  }
}
