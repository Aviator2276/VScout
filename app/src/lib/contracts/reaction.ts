// Reactions (ADR-066/073, http-api-contract §4.7). The server validates the same allow-list.
import { z } from "zod"
import { recordId, wireOwnedMeta } from "./primitives"

export const REACTION_EMOJI = ["👍", "❤️", "🎉", "😂", "😮", "👀"] as const
export const reactionEmoji = z.enum(REACTION_EMOJI)

export const wireReaction = z.looseObject({
  ...wireOwnedMeta,
  targetType: z.enum(["message", "announcement"]),
  targetId: recordId,
  emoji: reactionEmoji,
})
export type WireReaction = z.infer<typeof wireReaction>
