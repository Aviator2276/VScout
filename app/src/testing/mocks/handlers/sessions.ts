// Per-device sessions for the dev server (mockBackend.perDeviceSessions). Two devices signed in as
// different users (alex on a laptop, sam on a phone) no longer share one global "signed in as":
// that made alex's refresh return sam and the app wiped alex's device (cookie-user-mismatch).
import { http } from "msw"
import { mockBackend } from "../mock-backend"

export const REFRESH_COOKIE = "vscout_mock_refresh"
const ACCESS_PREFIX = "mock-access."

let counter = 0

export function newSession(
  userId: string,
  role: "admin" | "scouter" | "guest",
  user?: Record<string, unknown>
) {
  const sid = `s${Date.now().toString(36)}${(++counter).toString(36)}`
  mockBackend.sessions.set(sid, { userId, role, ...(user ? { user } : {}) })
  return {
    sid,
    accessToken: `${ACCESS_PREFIX}${sid}`,
    cookie: `${REFRESH_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
  }
}

export function clearCookie(): string {
  return `${REFRESH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function sessionFromCookie(request: Request) {
  const raw = request.headers.get("cookie") ?? ""
  const sid = raw
    .split(/;\s*/)
    .find((c) => c.startsWith(`${REFRESH_COOKIE}=`))
    ?.slice(REFRESH_COOKIE.length + 1)
  const session = sid ? mockBackend.sessions.get(sid) : undefined
  return sid && session ? { sid, ...session } : null
}

/** Act as the access token's user for this request (falls through to the real handler). */
export const sessionHandlers = [
  http.all("*/api/v1/*", ({ request }) => {
    if (!mockBackend.perDeviceSessions) return undefined
    const token = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
    if (!token?.startsWith(ACCESS_PREFIX)) return undefined
    const session = mockBackend.sessions.get(token.slice(ACCESS_PREFIX.length))
    if (session) {
      mockBackend.userId = session.userId
      mockBackend.role = mockBackend.alwaysAdmin.has(session.userId)
        ? "admin"
        : session.role
    }
    return undefined
  }),
]
