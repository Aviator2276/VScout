// entity → adapter, and decodeRecord(): normalize → wire schema → domain.
import type { z } from "zod"
import { ENTITY_SCHEMAS } from "@/lib/contracts/entities"
import type { EntityName } from "@/lib/contracts/entities"
import type { DomainRecords } from "@/lib/db/types"
import type { EntityAdapter } from "./entity-adapter"
import {
  allianceRankAdapter,
  commentAdapter,
  mediaAssetAdapter,
  messageAdapter,
  picklistAdapter,
  picklistEntryAdapter,
  pitScoutingAdapter,
  postScoutingAdapter,
  reactionAdapter,
  scoutEntryAdapter,
} from "./owned-adapters"
import {
  eventAdapter,
  eventTeamAdapter,
  matchAdapter,
  teamAdapter,
  userAdapter,
} from "./reference-adapters"
import {
  allianceBoardAdapter,
  eventSettingsAdapter,
  teamSettingsAdapter,
  userSettingsAdapter,
} from "./settings-adapters"

export const ENTITY_ADAPTERS: {
  [TEntity in EntityName]: EntityAdapter<TEntity>
} = {
  event: eventAdapter,
  team: teamAdapter,
  eventTeam: eventTeamAdapter,
  match: matchAdapter,
  user: userAdapter,
  userSettings: userSettingsAdapter,
  teamSettings: teamSettingsAdapter,
  scoutEntry: scoutEntryAdapter,
  pitScouting: pitScoutingAdapter,
  postScouting: postScoutingAdapter,
  comment: commentAdapter,
  allianceRank: allianceRankAdapter,
  message: messageAdapter,
  reaction: reactionAdapter,
  picklist: picklistAdapter,
  picklistEntry: picklistEntryAdapter,
  eventSettings: eventSettingsAdapter,
  allianceBoard: allianceBoardAdapter,
  mediaAsset: mediaAssetAdapter,
}

export type DecodeResult<T> =
  { ok: true; value: T } | { ok: false; error: z.ZodError }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Raw JSON from any transport → the domain record for `entity`, or a validation error. */
export function decodeRecord<TEntity extends EntityName>(
  entity: TEntity,
  raw: unknown,
  /** overridable so the contract tests can prove a drift fix needs one adapter only */
  adapters: { [TKey in EntityName]: EntityAdapter<TKey> } = ENTITY_ADAPTERS
): DecodeResult<DomainRecords[TEntity]> {
  const adapter = adapters[entity]
  const normalized =
    isObject(raw) && adapter.normalize ? adapter.normalize(raw) : raw
  const schema = ENTITY_SCHEMAS[entity] as unknown as z.ZodType<
    Parameters<EntityAdapter<TEntity>["toDomain"]>[0]
  >
  const parsed = schema.safeParse(normalized)
  if (!parsed.success) return { ok: false, error: parsed.error }
  return { ok: true, value: adapter.toDomain(parsed.data) }
}
