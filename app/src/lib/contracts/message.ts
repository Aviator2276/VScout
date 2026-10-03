// Chat messages and announcements (ADR-034/066). Channels: `event:<eventKey>` or
// `dm:<userA>:<userB>` with the two ids sorted.
import { z } from "zod"
import { matchKey, recordId, teamNumber, wireOwnedMeta } from "./primitives"

export const channelId = z
  .string()
  .regex(
    /^(event:\d{4}[a-z0-9]+|dm:[^:]+:[^:]+)$/,
    "event:<eventKey> or dm:<a>:<b>"
  )

export const wireMessage = z.looseObject({
  ...wireOwnedMeta,
  channelId,
  kind: z.enum(["message", "announcement"]),
  body: z.string().min(1).max(4000),
  priority: z.enum(["normal", "urgent"]).default("normal"),
  replyToId: recordId.nullable().optional(),
  refs: z
    .object({
      teamNumber: teamNumber.optional(),
      matchKey: matchKey.optional(),
    })
    .optional(),
})
export type WireMessage = z.infer<typeof wireMessage>

export function dmChannelId(a: string, b: string): string {
  const [x, y] = [a, b].sort()
  return `dm:${x}:${y}`
}
