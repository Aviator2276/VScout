import { http, HttpResponse } from "msw"
import { wireMeta } from "../../factories/wire"
import { mockBackend } from "../mock-backend"

export const metaHandlers = [
  // the server clock: the client derives its clock skew from it (dev: real time)
  http.get("*/api/v1/meta", () =>
    HttpResponse.json(
      wireMeta({
        serverTime: mockBackend.at(),
        capabilities: {
          mqttRpc: true,
          restore: true,
          guestLogin: true,
          reactions: true,
          // the dev server streams changes over SSE (dev-stack/mock-api/serve.mjs)
          ...(mockBackend.perDeviceSessions
            ? { changeStream: true, demoSeed: true }
            : {}),
        },
      })
    )
  ),
]
