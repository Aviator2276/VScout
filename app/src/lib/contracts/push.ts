// Push payload (push-contract §5). The SW validates it before showing anything; deep links are
// app-relative and checked again against the route table.
import { z } from "zod"
import { isoDateTime, recordId } from "./primitives"

export const pushKind = z.enum([
  "message",
  "announcement",
  "urgent",
  "match",
  "system",
])

export const pushPayload = z.looseObject({
  web_push: z.literal(8030),
  mutable: z.boolean().optional(),
  notification: z.looseObject({
    title: z.string().min(1).max(80),
    body: z.string().max(240).optional(),
    navigate: z.url(),
    tag: z.string().min(1),
    requireInteraction: z.boolean().optional(),
    renotify: z.boolean().optional(),
    timestamp: z.number().int().optional(),
    app_badge: z.number().int().min(0).optional(),
    data: z.looseObject({
      v: z.literal(1),
      id: recordId,
      kind: pushKind,
      url: z
        .string()
        .startsWith("/")
        .refine((u) => !u.startsWith("//"), "app-relative path"),
      uid: recordId,
      eventKey: z.string().nullable(),
      entity: z.object({ type: z.string(), id: z.string() }).nullable(),
      ts: isoDateTime,
    }),
  }),
})
export type PushPayload = z.infer<typeof pushPayload>
