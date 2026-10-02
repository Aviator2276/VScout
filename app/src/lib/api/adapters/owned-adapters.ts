// Author-owned records. They share one mapping: wire meta → OwnedMeta (synced), rest unchanged.
import type { EntityName } from "@/lib/contracts/entities"
import type { EntityAdapter } from "./entity-adapter"
import { ownedMeta, withoutOwnedMeta } from "./entity-adapter"

type OwnedEntity =
  | "scoutEntry"
  | "pitScouting"
  | "postScouting"
  | "allianceRank"
  | "comment"
  | "message"
  | "reaction"
  | "picklist"
  | "picklistEntry"
  | "mediaAsset"

function ownedAdapter<
  TEntity extends OwnedEntity & EntityName,
>(): EntityAdapter<TEntity> {
  return {
    toDomain: (w) => ({ ...withoutOwnedMeta(w), ...ownedMeta(w) }),
  }
}

export const scoutEntryAdapter = ownedAdapter<"scoutEntry">()
export const pitScoutingAdapter = ownedAdapter<"pitScouting">()
export const postScoutingAdapter = ownedAdapter<"postScouting">()
export const allianceRankAdapter = ownedAdapter<"allianceRank">()
export const commentAdapter = ownedAdapter<"comment">()
export const messageAdapter = ownedAdapter<"message">()
export const reactionAdapter = ownedAdapter<"reaction">()
export const picklistAdapter = ownedAdapter<"picklist">()
export const picklistEntryAdapter = ownedAdapter<"picklistEntry">()
export const mediaAssetAdapter = ownedAdapter<"mediaAsset">()
