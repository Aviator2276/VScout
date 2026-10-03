// Login, guest login, refresh and /me → the session the app keeps (no tokens persisted:
// the access token stays in memory, the refresh token is an HttpOnly cookie, ADR-024/035).
import { meResponse, sessionResponse } from "@/lib/contracts/auth"
import type { WireAuthUser } from "@/lib/contracts/user"
import type { Role } from "@/lib/contracts/primitives"
import type { DecodeResult } from "./entity-registry"
import { isoToMs } from "./time"

export interface SessionUser {
  id: string
  username: string | null
  displayName: string
  role: Role
  teamNumber: number | null
}

export interface DecodedSession {
  accessToken: string
  accessExpiresAt: number
  refreshExpiresAt: number
  user: SessionUser
  /** guest sessions: the event the guest code belongs to */
  eventKey: string | null
  /** from POST /auth/refresh when the backend sends it (PV-3) */
  deviceId: string | null
}

function toUser(u: WireAuthUser): SessionUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    teamNumber: u.teamNumber ?? null,
  }
}

export function decodeSession(raw: unknown): DecodeResult<DecodedSession> {
  const parsed = sessionResponse.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error }
  const s = parsed.data
  return {
    ok: true,
    value: {
      accessToken: s.accessToken,
      accessExpiresAt: isoToMs(s.accessExpiresAt),
      refreshExpiresAt: isoToMs(s.refreshExpiresAt),
      user: toUser(s.user),
      eventKey: s.eventKey ?? null,
      deviceId: s.deviceId ?? null,
    },
  }
}

export interface DecodedMe {
  user: SessionUser
  permissions: Array<string> | null
  serverTime: number
  refreshExpiresAt: number
}

export function decodeMe(raw: unknown): DecodeResult<DecodedMe> {
  const parsed = meResponse.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error }
  const m = parsed.data
  return {
    ok: true,
    value: {
      user: toUser(m.user),
      permissions: m.permissions ?? null,
      serverTime: isoToMs(m.serverTime),
      refreshExpiresAt: isoToMs(m.refreshExpiresAt),
    },
  }
}
