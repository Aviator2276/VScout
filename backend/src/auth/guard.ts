// Bearer-token authentication shared by HTTP, MQTT RPC and the SSE stream.
import type { Sessions } from "./sessions.js"
import type { TokenService, TokenRole } from "./tokens.js"
import type { Users } from "../domain/users.js"
import type { Settings } from "../domain/settings.js"
import { problem } from "../lib/problem.js"

export interface Principal {
  id: string
  role: Exclude<TokenRole, "service">
  sid: string
  cid: string
  deviceId: string
  /** guests only: the event their code opened */
  eventKey?: string
  iat: number
}

export function deviceIdFromCid(cid: string, sub: string): string {
  const prefix = `vscout-${sub}-`
  return cid.startsWith(prefix) ? cid.slice(prefix.length) : ""
}

export class Guard {
  constructor(
    private tokens: TokenService,
    private sessions: Sessions,
    private users: Users,
    private settings: Settings
  ) {}

  async fromHeader(header: string | undefined): Promise<Principal> {
    const m = /^Bearer\s+(.+)$/i.exec(header ?? "")
    if (!m) throw problem(401, "token_invalid", { detail: "Bearer token required" })
    return this.fromToken((m[1] as string).trim())
  }

  async fromToken(token: string): Promise<Principal> {
    const c = await this.tokens.verify(token)
    if (c.role === "service") throw problem(401, "token_invalid")
    if (!this.sessions.isLive(c.sid)) throw problem(401, "token_invalid", { detail: "Session ended" })
    if (c.role === "guest") {
      if (!c.ek || !this.settings.guestAccessEnabled(c.ek)) throw problem(401, "token_invalid", { detail: "Guest access ended" })
    } else {
      const u = this.users.byId(c.sub)
      if (!u || u.active !== 1) throw problem(401, "token_invalid", { detail: "Account disabled" })
      if (c.iat < Math.floor(u.tokens_valid_after / 1000)) throw problem(401, "token_invalid", { detail: "Session revoked" })
      // the token's role must still be the account's role (a demotion takes effect at once)
      if (u.role !== c.role) throw problem(401, "token_invalid", { detail: "Role changed" })
    }
    return {
      id: c.sub,
      role: c.role,
      sid: c.sid,
      cid: c.cid,
      deviceId: deviceIdFromCid(c.cid, c.sub),
      ...(c.ek ? { eventKey: c.ek } : {}),
      iat: c.iat,
    }
  }
}
