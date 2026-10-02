// Shared wire primitives (contracts/http-api-contract.md §0). Wire timestamps are ISO 8601 UTC
// strings; adapters convert them to epoch ms for the domain.
import { z } from "zod"

export const isoDateTime = z.iso.datetime({ offset: true })

/** Client-created ids are UUIDv7; server ids are opaque. Both are non-empty strings. */
export const recordId = z.string().min(1).max(64)

export const eventKey = z
  .string()
  .regex(/^\d{4}[a-z0-9]+$/, "event key like 2026casj")
export const matchKey = z
  .string()
  .regex(
    /^\d{4}[a-z0-9]+_(qm|ef|qf|sf|f)\d+(m\d+)?$/,
    "match key like 2026casj_qm12"
  )
export const teamNumber = z.number().int().positive().max(99999)

export const role = z.enum(["admin", "scouter", "guest"])
export type Role = z.infer<typeof role>

/** Fields every server record carries on the wire (data-layer §3). */
export const wireServerMeta = {
  id: recordId,
  rev: z.number().int().min(1),
  updatedAt: isoDateTime,
}

/** Author-owned records (ADR-004). The server sets authorId, createdAt and updatedAt. */
export const wireOwnedMeta = {
  ...wireServerMeta,
  eventKey,
  authorId: recordId,
  createdAt: isoDateTime,
  updatedBy: recordId.optional(), // set when an admin edited someone else's record
}

/** Records carrying a game-module payload (§4.5). `data` is validated by the game module. */
export const wireGamePayload = {
  gameId: z.string().min(1).max(40),
  schemaVersion: z.number().int().min(1),
  data: z.record(z.string(), z.unknown()),
}
