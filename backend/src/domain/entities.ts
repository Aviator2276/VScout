// Server-side entity registry (REQUIREMENTS §5.1): wire names, REST collections, schemas,
// natural keys and MQTT QoS. One generic write path is driven by this table.
import type { z } from "zod"
import * as c from "./contracts.js"

export const ENTITY_NAMES = [
  "event",
  "team",
  "user",
  "eventTeam",
  "match",
  "userSettings",
  "teamSettings",
  "scoutEntry",
  "pitScouting",
  "postScouting",
  "allianceRank",
  "comment",
  "message",
  "reaction",
  "picklist",
  "picklistEntry",
  "eventSettings",
  "allianceBoard",
  "mediaAsset",
] as const
export type EntityName = (typeof ENTITY_NAMES)[number]

export const isEntityName = (s: string): s is EntityName =>
  (ENTITY_NAMES as readonly string[]).includes(s)

export type Rec = Record<string, unknown> & { id: string; rev: number }

export interface OwnedEntityDef {
  entity: EntityName
  collection: string
  schema: z.ZodType<Record<string, unknown>>
  /** game payload (gameId/schemaVersion/data) validated against supported versions */
  game: boolean
  /** unique-per tuple (REQUIREMENTS §5.1); null = id only */
  naturalKey: ((r: Record<string, unknown>) => string) | null
  /** fields a PUT may not change (they decide visibility or identity) */
  immutable: string[]
}

const owned = (d: Partial<OwnedEntityDef> & Pick<OwnedEntityDef, "entity" | "collection" | "schema">): OwnedEntityDef => ({
  game: false,
  naturalKey: null,
  immutable: [],
  ...d,
})

export const OWNED: Record<string, OwnedEntityDef> = Object.fromEntries(
  [
    owned({
      entity: "scoutEntry",
      collection: "scout-entries",
      schema: c.scoutEntry,
      game: true,
      naturalKey: (r) => `${r.eventKey}|${r.matchKey}|${r.teamNumber}|${r.authorId}`,
    }),
    owned({
      entity: "pitScouting",
      collection: "pit-scouting",
      schema: c.pitScouting,
      game: true,
      naturalKey: (r) => `${r.eventKey}|${r.teamNumber}|${r.authorId}`,
    }),
    owned({
      entity: "postScouting",
      collection: "post-scouting",
      schema: c.postScouting,
      game: true,
      naturalKey: (r) => `${r.eventKey}|${r.teamNumber}|${r.authorId}`,
    }),
    owned({
      entity: "allianceRank",
      collection: "alliance-ranks",
      schema: c.allianceRank,
      naturalKey: (r) => `${r.eventKey}|${r.matchKey}|${r.alliance}|${r.authorId}`,
    }),
    owned({ entity: "comment", collection: "comments", schema: c.comment }),
    owned({
      entity: "message",
      collection: "messages",
      schema: c.message,
      immutable: ["channelId", "kind"],
    }),
    owned({
      entity: "reaction",
      collection: "reactions",
      schema: c.reaction,
      naturalKey: (r) => `${r.targetType}|${r.targetId}|${r.authorId}|${r.emoji}`,
      immutable: ["targetType", "targetId", "emoji"],
    }),
    owned({ entity: "picklist", collection: "picklists", schema: c.picklist }),
    owned({
      entity: "picklistEntry",
      collection: "picklist-entries",
      schema: c.picklistEntry,
      naturalKey: (r) => `${r.picklistId}|${r.teamNumber}`,
      immutable: ["picklistId"],
    }),
  ].map((d) => [d.collection, d])
)

/** `media` is a collection for DELETE/restore only; creation is the multipart upload. */
export const COLLECTION_ENTITY: Record<string, EntityName> = {
  ...Object.fromEntries(Object.values(OWNED).map((d) => [d.collection, d.entity])),
  media: "mediaAsset",
}

export const ENTITY_COLLECTION: Partial<Record<EntityName, string>> = Object.fromEntries(
  Object.entries(COLLECTION_ENTITY).map(([k, v]) => [v, k])
)

/** MQTT QoS per entity (REQUIREMENTS §9.4). */
export const QOS: Record<EntityName, 0 | 1> = {
  message: 1,
  comment: 1,
  scoutEntry: 1,
  pitScouting: 1,
  postScouting: 1,
  allianceRank: 1,
  match: 1,
  picklist: 1,
  picklistEntry: 1,
  eventSettings: 1,
  allianceBoard: 1,
  teamSettings: 1,
  userSettings: 1,
  eventTeam: 0,
  team: 0,
  event: 0,
  user: 0,
  mediaAsset: 0,
  reaction: 0,
}

/** Which publish queue an entity uses (REQUIREMENTS §9.6 rule 6). */
export type Lane = "urgent" | "normal" | "bulk"
export function laneFor(entity: EntityName, rec: Record<string, unknown> | undefined): Lane {
  if (entity === "message" && rec) {
    const ch = String(rec.channelId ?? "")
    if (rec.kind === "announcement" || ch.startsWith("dm:")) return "urgent"
  }
  if (["scoutEntry", "pitScouting", "postScouting", "team", "eventTeam", "event"].includes(entity))
    return "bulk"
  return "normal"
}

/** Entities each sync scope serves (matches the app's SCOPE_GROUPS). */
export const SCOPE_ENTITIES = {
  global: ["teamSettings", "event", "team"],
  user: ["message", "comment", "reaction", "userSettings", "user"],
  event: [
    "match",
    "scoutEntry",
    "comment",
    "message",
    "eventSettings",
    "allianceBoard",
    "picklist",
    "picklistEntry",
    "eventTeam",
    "pitScouting",
    "postScouting",
    "allianceRank",
    "mediaAsset",
    "reaction",
  ],
} as const satisfies Record<string, readonly EntityName[]>
