// Push endpoints (push-contract §2): a fixed VAPID key, subscriptions kept in the mock backend.
import { HttpResponse, http } from "msw"
import { mockBackend } from "../mock-backend"

// a valid uncompressed P-256 point, base64url (65 bytes)
export const MOCK_VAPID_KEY =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"

export const pushHandlers = [
  http.get("*/api/v1/push/vapid-public-key", () =>
    HttpResponse.json({ publicKey: MOCK_VAPID_KEY })
  ),
  http.put(
    "*/api/v1/push/subscriptions/:deviceId",
    async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>
      mockBackend.pushSubscriptions.set(String(params.deviceId), body)
      return HttpResponse.json({
        deviceId: params.deviceId,
        createdAt: mockBackend.now(),
        lastSeenAt: mockBackend.now(),
      })
    }
  ),
  http.delete("*/api/v1/push/subscriptions/:deviceId", ({ params }) => {
    mockBackend.pushSubscriptions.delete(String(params.deviceId))
    return new HttpResponse(null, { status: 204 })
  }),
  http.post("*/api/v1/push/test", () =>
    HttpResponse.json(
      { notificationId: "01900000-0000-7000-8000-00000000c001", targeted: 1 },
      { status: 202 }
    )
  ),
]
