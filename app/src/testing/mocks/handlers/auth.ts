// Auth endpoints (http-api-contract §2) against fixed mock credentials.
import { http, HttpResponse } from "msw"
import { guestLoginRequest, loginRequest } from "@/lib/contracts/auth"
import { testId, testTime } from "../../factories/ids"
import { TEST_EVENT, wireSession } from "../../factories/wire"
import { MOCK_CREDENTIALS, MOCK_GUEST_CODE, mockBackend } from "../mock-backend"
import { problemResponse } from "./problem"

export const authHandlers = [
  http.post("*/api/v1/auth/login", async ({ request }) => {
    const body = loginRequest.safeParse(await request.json())
    if (!body.success) return problemResponse(422, "validation_failed")
    const { username, password } = body.data
    if (
      username !== MOCK_CREDENTIALS.username ||
      password !== MOCK_CREDENTIALS.password
    )
      return problemResponse(401, "invalid_credentials")
    return HttpResponse.json(wireSession())
  }),

  http.post("*/api/v1/auth/guest", async ({ request }) => {
    const body = guestLoginRequest.safeParse(await request.json())
    if (!body.success || body.data.code !== MOCK_GUEST_CODE)
      return problemResponse(401, "invalid_guest_code")
    return HttpResponse.json(
      wireSession({
        eventKey: TEST_EVENT,
        user: {
          id: `guest-${body.data.deviceId}`,
          username: null,
          displayName: "Guest",
          role: "guest",
          teamNumber: 2276,
        },
      })
    )
  }),

  http.post("*/api/v1/auth/refresh", () =>
    mockBackend.refreshValid
      ? HttpResponse.json(wireSession({ deviceId: testId(8000) }))
      : problemResponse(401, "refresh_invalid")
  ),

  http.post(
    "*/api/v1/auth/logout",
    () => new HttpResponse(null, { status: 204 })
  ),

  http.get("*/api/v1/me", () => {
    const s = wireSession()
    return HttpResponse.json({
      user: s.user,
      serverTime: testTime(),
      refreshExpiresAt: s.refreshExpiresAt,
    })
  }),
]
