// Auth endpoints (http-api-contract §2) against fixed mock credentials.
import { http, HttpResponse } from "msw"
import { guestLoginRequest, loginRequest } from "@/lib/contracts/auth"
import { testId, testTime } from "../../factories/ids"
import { TEST_EVENT, wireSession } from "../../factories/wire"
import { MOCK_GUEST_CODE, mockBackend } from "../mock-backend"
import { activeGuestCode } from "./admin"
import { clearCookie, newSession, sessionFromCookie } from "./sessions"
import { problemResponse } from "./problem"

/** The single-caller refresh the unit and e2e tests use. */
function refreshAnswer() {
  return mockBackend.refreshValid &&
    (!mockBackend.requireSignIn || mockBackend.signedIn)
    ? HttpResponse.json(
        wireSession({
          deviceId: testId(8000),
          user: mockBackend.sessionUser(),
        })
      )
    : problemResponse(401, "refresh_invalid")
}

export const authHandlers = [
  http.post("*/api/v1/auth/login", async ({ request }) => {
    const body = loginRequest.safeParse(await request.json())
    if (!body.success) return problemResponse(422, "validation_failed")
    const { username, password } = body.data
    const account = mockBackend.accounts.get(username)
    if (!account || account.password !== password)
      return problemResponse(401, "invalid_credentials")
    mockBackend.userId = account.id
    if (account.role) mockBackend.role = account.role
    mockBackend.signedIn = true
    if (mockBackend.perDeviceSessions) {
      const s = newSession(account.id, mockBackend.role)
      return HttpResponse.json(
        wireSession({
          user: mockBackend.sessionUser(),
          accessToken: s.accessToken,
        }),
        { headers: { "Set-Cookie": s.cookie } }
      )
    }
    return HttpResponse.json(wireSession({ user: mockBackend.sessionUser() }))
  }),

  http.post("*/api/v1/auth/guest", async ({ request }) => {
    const body = guestLoginRequest.safeParse(await request.json())
    // an admin-set code wins over the fixed mock one (features/admin.md AD3b)
    if (
      !body.success ||
      body.data.code !== (activeGuestCode() ?? MOCK_GUEST_CODE)
    )
      return problemResponse(401, "invalid_guest_code")
    mockBackend.signedIn = true
    const user = {
      id: `guest-${body.data.deviceId}`,
      username: null,
      displayName: "Guest",
      role: "guest" as const,
      teamNumber: 2276,
    }
    if (mockBackend.perDeviceSessions) {
      const s = newSession(user.id, "guest", user)
      return HttpResponse.json(
        wireSession({ eventKey: TEST_EVENT, user, accessToken: s.accessToken }),
        { headers: { "Set-Cookie": s.cookie } }
      )
    }
    return HttpResponse.json(wireSession({ eventKey: TEST_EVENT, user }))
  }),

  http.post("*/api/v1/auth/refresh", ({ request }) => {
    if (mockBackend.perDeviceSessions) {
      // this device's own session, from its cookie (never another device's sign-in)
      const session = sessionFromCookie(request)
      if (!session) return problemResponse(401, "refresh_invalid")
      mockBackend.userId = session.userId
      mockBackend.role = session.role
      return HttpResponse.json(
        wireSession({
          deviceId: testId(8000),
          user: (session.user ?? mockBackend.sessionUser()) as ReturnType<
            typeof mockBackend.sessionUser
          >,
          accessToken: `mock-access.${session.sid}`,
          ...(session.role === "guest" ? { eventKey: TEST_EVENT } : {}),
        })
      )
    }
    return refreshAnswer()
  }),

  http.post("*/api/v1/auth/logout", ({ request }) => {
    if (mockBackend.perDeviceSessions) {
      const session = sessionFromCookie(request)
      if (session) mockBackend.sessions.delete(session.sid)
      return new HttpResponse(null, {
        status: 204,
        headers: { "Set-Cookie": clearCookie() },
      })
    }
    mockBackend.signedIn = false
    return new HttpResponse(null, { status: 204 })
  }),

  http.get("*/api/v1/me", () => {
    const s = wireSession({ user: mockBackend.sessionUser() })
    return HttpResponse.json({
      user: s.user,
      serverTime: testTime(),
      refreshExpiresAt: s.refreshExpiresAt,
    })
  }),
]
