// Auth endpoints (http-api-contract §2). The refresh token is an HttpOnly cookie, never in a body.
import { z } from "zod"
import { authUser } from "./user"
import { eventKey, isoDateTime, recordId } from "./primitives"

export const loginRequest = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  deviceId: recordId,
  deviceName: z.string().max(80),
})

/** Unambiguous alphabet, no 0/O/1/I (ADR-073). */
export const GUEST_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
export const guestCode = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(/^[2-9A-HJ-NP-Z]{6}$/, "6 characters"))

export const guestLoginRequest = z.object({
  code: guestCode,
  deviceId: recordId,
  deviceName: z.string().max(80),
})

export const sessionResponse = z.looseObject({
  accessToken: z.string().min(1),
  accessExpiresAt: isoDateTime,
  refreshExpiresAt: isoDateTime,
  user: authUser,
  /** guest sessions: the event the code belongs to */
  eventKey: eventKey.optional(),
  /** POST /auth/refresh (PV-3); optional because the backend may not send it (ADR-071) */
  deviceId: recordId.optional(),
})
export type WireSessionResponse = z.infer<typeof sessionResponse>

export const meResponse = z.looseObject({
  user: authUser,
  permissions: z.array(z.string()).optional(),
  serverTime: isoDateTime,
  refreshExpiresAt: isoDateTime,
})
export type WireMeResponse = z.infer<typeof meResponse>

export const logoutRequest = z.object({ deviceId: recordId })
