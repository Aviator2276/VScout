// Session types (routing-auth §3). No tokens here: the access token is memory-only and the refresh
// token is an HttpOnly cookie (ADR-024/035).
import type { Role } from "@/lib/contracts/primitives"

export type { Role }

export interface Session {
  userId: string
  displayName: string
  role: Role
  /** epoch ms, from the token response; drives the expiry warning (ADR-035) */
  refreshExpiresAt: number
  /** needs-reauth: the server rejected the refresh while online */
  status: "active" | "needs-reauth"
  /** guest sessions belong to one event (ADR-073) */
  eventKey: string | null
}
