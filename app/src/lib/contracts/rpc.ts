// MQTT 5 request/response envelopes (ADR-063, mqtt-contract §10.2–10.3).
import { z } from "zod"
import { recordId } from "./primitives"

export const httpMethod = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"])

export const rpcRequest = z.object({
  v: z.literal(1),
  id: recordId,
  method: httpMethod,
  path: z.string().startsWith("/"),
  query: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional(),
  headers: z.record(z.string(), z.string()),
  body: z.unknown().optional(),
})
export type RpcRequest = z.infer<typeof rpcRequest>

export const rpcResponse = z.looseObject({
  v: z.literal(1),
  id: recordId,
  status: z.number().int().min(100).max(599),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.unknown().optional(),
})
export type RpcResponse = z.infer<typeof rpcResponse>
