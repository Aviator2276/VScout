// How each entity is stored (data-layer §7.1): its table, key, ownership class and, for scouting
// records, which game form validates its payload. One generic engine is driven by this table.
import type { EntityName } from "@/lib/contracts/entities"
import type { VScoutDB } from "@/lib/db/schema"

export type EntityClass =
  /** server-owned, read-only (events, teams, matches, users) */
  | "reference"
  /** author-owned, written through the outbox (ADR-004) */
  | "owned"
  /** admin singletons that can truly conflict (eventSettings, teamSettings) */
  | "singleton"
  /** one JSON document per user; per-key last-writer-wins, never a conflict (ADR-033) */
  | "userDoc"
  /** the live alliance board: online-only actions, never in the outbox (ADR-032/064) */
  | "board"

export type TableName = {
  [TKey in keyof VScoutDB]: VScoutDB[TKey] extends { schema: unknown }
    ? TKey
    : never
}[keyof VScoutDB]

export interface EntityDef {
  entity: EntityName
  table: TableName
  cls: EntityClass
  /** envelope id → the table's primary key */
  key: (id: string) => string | number
  /** which game form validates `data` on ingest and write */
  gameForm?: "match" | "pit" | "post"
  /** REST collection for writes (http-api-contract §4.2) */
  collection?: string
}

const byId = (id: string) => id

export const ENTITY_DEFS: {
  [TKey in EntityName]: EntityDef & { entity: TKey }
} = {
  event: { entity: "event", table: "events", cls: "reference", key: byId },
  team: {
    entity: "team",
    table: "teams",
    cls: "reference",
    key: (id) => Number(id),
  },
  eventTeam: {
    entity: "eventTeam",
    table: "eventTeams",
    cls: "reference",
    key: byId,
  },
  match: { entity: "match", table: "matches", cls: "reference", key: byId },
  user: { entity: "user", table: "users", cls: "reference", key: byId },
  userSettings: {
    entity: "userSettings",
    table: "userSettings",
    cls: "userDoc",
    key: byId,
  },
  teamSettings: {
    entity: "teamSettings",
    table: "teamSettings",
    cls: "singleton",
    key: byId,
  },
  eventSettings: {
    entity: "eventSettings",
    table: "eventSettings",
    cls: "singleton",
    key: byId,
  },
  allianceBoard: {
    entity: "allianceBoard",
    table: "allianceBoards",
    cls: "board",
    key: byId,
  },
  scoutEntry: {
    entity: "scoutEntry",
    table: "scoutEntries",
    cls: "owned",
    key: byId,
    gameForm: "match",
    collection: "scout-entries",
  },
  pitScouting: {
    entity: "pitScouting",
    table: "pitScouting",
    cls: "owned",
    key: byId,
    gameForm: "pit",
    collection: "pit-scouting",
  },
  postScouting: {
    entity: "postScouting",
    table: "postScouting",
    cls: "owned",
    key: byId,
    gameForm: "post",
    collection: "post-scouting",
  },
  allianceRank: {
    entity: "allianceRank",
    table: "allianceRanks",
    cls: "owned",
    key: byId,
    collection: "alliance-ranks",
  },
  comment: {
    entity: "comment",
    table: "comments",
    cls: "owned",
    key: byId,
    collection: "comments",
  },
  message: {
    entity: "message",
    table: "messages",
    cls: "owned",
    key: byId,
    collection: "messages",
  },
  reaction: {
    entity: "reaction",
    table: "reactions",
    cls: "owned",
    key: byId,
    collection: "reactions",
  },
  picklist: {
    entity: "picklist",
    table: "picklists",
    cls: "owned",
    key: byId,
    collection: "picklists",
  },
  picklistEntry: {
    entity: "picklistEntry",
    table: "picklistEntries",
    cls: "owned",
    key: byId,
    collection: "picklist-entries",
  },
  mediaAsset: {
    entity: "mediaAsset",
    table: "mediaAssets",
    cls: "owned",
    key: byId,
    collection: "media",
  },
}

/** Author-owned entities: written through mutate.ts and the outbox (ENTITY_DEFS cls "owned"). */
export const OWNED_ENTITIES = [
  "scoutEntry",
  "pitScouting",
  "postScouting",
  "allianceRank",
  "comment",
  "message",
  "reaction",
  "picklist",
  "picklistEntry",
  "mediaAsset",
] as const satisfies ReadonlyArray<EntityName>
export type OwnedEntity = (typeof OWNED_ENTITIES)[number]

export function recordKey(entity: string, id: string): string {
  return `${entity}:${id}`
}

/** Every table a sync transaction over these entities touches. */
export function tablesFor(db: VScoutDB, entities: ReadonlyArray<EntityName>) {
  const names = new Set<TableName>(entities.map((e) => ENTITY_DEFS[e].table))
  return [...names].map((n) => db.table(n))
}
