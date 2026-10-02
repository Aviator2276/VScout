// Reads (never verifies) access-token claims for display and timing. The server is the authority.
import { z } from "zod"

const claims = z.looseObject({
  sub: z.string().optional(),
  exp: z.number().optional(),
  role: z.enum(["admin", "scouter", "guest"]).optional(),
  cid: z.string().optional(),
})
export type JwtClaims = z.infer<typeof claims>

function base64UrlDecode(part: string): string {
  const b64 = part
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(part.length / 4) * 4, "=")
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function decodeClaims(token: string): JwtClaims | null {
  const payload = token.split(".")[1]
  if (!payload) return null
  try {
    const r = claims.safeParse(JSON.parse(base64UrlDecode(payload)))
    return r.success ? r.data : null
  } catch {
    return null
  }
}
