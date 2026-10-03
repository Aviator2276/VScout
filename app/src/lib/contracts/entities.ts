// Entity name → wire record schema (http-api-contract §0.2). The change log, MQTT data topics and
// write responses all carry these records.
import { z } from "zod"
import { wireAllianceBoard } from "./alliance-board"
import { wireComment } from "./comment"
import { wireEvent, wireEventTeam, wireTeam } from "./event"
import { wireEventSettings } from "./event-settings"
import { wireMatch } from "./match"
import { wireMediaAsset } from "./media"
import { wireMessage } from "./message"
import { wirePicklist, wirePicklistEntry } from "./picklist"
import { wireReaction } from "./reaction"
import {
  wireAllianceRank,
  wirePitScouting,
  wirePostScouting,
  wireScoutEntry,
} from "./scouting"
import { wireTeamSettings } from "./team-settings"
import { wireUser } from "./user"
import { wireUserSettings } from "./user-settings"

export const ENTITY_SCHEMAS = {
  event: wireEvent,
  team: wireTeam,
  eventTeam: wireEventTeam,
  match: wireMatch,
  user: wireUser,
  userSettings: wireUserSettings,
  teamSettings: wireTeamSettings,
  scoutEntry: wireScoutEntry,
  pitScouting: wirePitScouting,
  postScouting: wirePostScouting,
  comment: wireComment,
  allianceRank: wireAllianceRank,
  message: wireMessage,
  reaction: wireReaction,
  picklist: wirePicklist,
  picklistEntry: wirePicklistEntry,
  eventSettings: wireEventSettings,
  allianceBoard: wireAllianceBoard,
  mediaAsset: wireMediaAsset,
} as const

export type EntityName = keyof typeof ENTITY_SCHEMAS
export const ENTITY_NAMES = Object.keys(ENTITY_SCHEMAS) as Array<EntityName>
export const entityName = z.enum(
  ENTITY_NAMES as [EntityName, ...Array<EntityName>]
)

export type WireRecord<TEntity extends EntityName> = z.infer<
  (typeof ENTITY_SCHEMAS)[TEntity]
>

export function isEntityName(value: string): value is EntityName {
  return value in ENTITY_SCHEMAS
}
