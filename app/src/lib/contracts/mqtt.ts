// Non-data MQTT payloads (mqtt-contract §5.2–5.7). Unknown `cmd` / `kind` values fail the schema
// and are dropped, so the server can add new kinds safely.
import { z } from "zod"
import { isoDateTime, recordId, role } from "./primitives"

export const presence = z.looseObject({
  v: z.literal(1),
  status: z.enum(["online", "away", "offline"]),
  userId: recordId,
  deviceId: recordId,
  ts: isoDateTime.optional(), // absent in the will message
  appVersion: z.string().optional(),
  reason: z.literal("lwt").optional(),
})
export type Presence = z.infer<typeof presence>

export const typing = z.looseObject({
  v: z.literal(1),
  channelId: z.string().min(1),
  userId: recordId,
  state: z.enum(["typing", "idle"]),
  ts: isoDateTime,
})

export const controlMessage = z.discriminatedUnion("cmd", [
  z.looseObject({
    v: z.literal(1),
    cmd: z.literal("resync"),
    entities: z.array(z.string()),
    reason: z.string().optional(),
    ts: isoDateTime,
  }),
  z.looseObject({
    v: z.literal(1),
    cmd: z.literal("reload"),
    minClientVersion: z.string().min(1),
    ts: isoDateTime,
  }),
])
export type ControlMessage = z.infer<typeof controlMessage>

export const sysStatus = z.looseObject({
  v: z.literal(1),
  minClientVersion: z.string().min(1),
  maintenance: z.boolean().default(false),
  message: z.string().nullable().default(null),
  ts: isoDateTime,
  capabilities: z.record(z.string(), z.boolean()).optional(),
})
export type SysStatus = z.infer<typeof sysStatus>

export const inboxMessage = z.discriminatedUnion("kind", [
  z.looseObject({
    v: z.literal(1),
    kind: z.literal("roleChanged"),
    role,
    ts: isoDateTime,
  }),
  z.looseObject({
    v: z.literal(1),
    kind: z.literal("forceLogout"),
    reason: z.string().min(1),
    ts: isoDateTime,
  }),
  z.looseObject({
    v: z.literal(1),
    kind: z.literal("sessionRevoked"),
    ts: isoDateTime,
  }),
])
export type InboxMessage = z.infer<typeof inboxMessage>

export const adminAlert = z.looseObject({
  v: z.literal(1),
  kind: z.string().min(1),
  message: z.string(),
  ts: isoDateTime,
  detail: z.record(z.string(), z.unknown()).optional(),
})
export type AdminAlert = z.infer<typeof adminAlert>
