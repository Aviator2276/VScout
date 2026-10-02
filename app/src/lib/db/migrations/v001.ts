// Dexie schema version 1 (data-layer §4). FROZEN once shipped: never edit, add v002.ts instead.
// Index notation: first entry = primary key, & unique, ++ auto-increment, [a+b] compound,
// * multi-entry. Index only what queries filter or sort by; never booleans or game payloads.
export const stores = {
  // identity and local state
  session: "id",
  kv: "key",
  deviceSettings: "id",
  userSettings: "userId",
  teamSettings: "id",
  users: "id, teamNumber",

  // reference data (server-owned, read-only)
  events: "key, year, startDate",
  teams: "teamNumber",
  eventTeams: "id, eventKey, [eventKey+teamNumber], [eventKey+rank]",
  matches:
    "key, eventKey, [eventKey+compLevel+setNumber+matchNumber], [eventKey+scheduledTime], *teamNumbers",

  // owned data
  scoutEntries:
    "id, eventKey, [eventKey+matchKey], [eventKey+teamNumber], [eventKey+authorId], [matchKey+teamNumber], syncState",
  pitScouting:
    "id, eventKey, [eventKey+teamNumber], [eventKey+authorId], syncState",
  postScouting:
    "id, eventKey, [eventKey+teamNumber], [eventKey+authorId], syncState",
  allianceRanks:
    "id, eventKey, [eventKey+matchKey], [eventKey+authorId], syncState",
  comments:
    "id, eventKey, [eventKey+teamNumber+createdAt], [eventKey+matchKey], [eventKey+authorId], syncState",
  messages:
    "id, eventKey, [channelId+createdAt], [eventKey+kind+createdAt], syncState",
  reactions: "id, eventKey, targetId, [eventKey+authorId], syncState",
  picklists: "id, eventKey, [eventKey+ownerId], syncState",
  picklistEntries:
    "id, eventKey, [picklistId+rank], [eventKey+teamNumber], syncState",
  eventSettings: "eventKey",
  allianceBoards: "eventKey",
  allianceSims: "id, eventKey, [eventKey+ownerId]",
  adminAudit: "id, eventKey, [eventKey+at]",

  // media
  mediaVideos: "id, eventKey, [eventKey+matchKey], downloadState, lastOpenedAt",
  mediaAssets: "id, eventKey, [eventKey+teamNumber], kind",
  mediaUploads: "id, ownerRecordId, uploadState",

  // sync machinery
  outbox: "++seq, &opId, recordKey, state, nextAttemptAt, userId, eventKey",
  syncCursors: "[scope+entity], scope",
  tombstones: "[entity+id], deletedAt, eventKey",
  conflicts: "id, [entity+recordId], status, eventKey",
  drafts: "id, [userId+kind], [userId+eventKey], eventKey, updatedAt",

  // diagnostics (coding-standards: logger ring buffer persisted for export)
  logs: "++id, at",
} as const
