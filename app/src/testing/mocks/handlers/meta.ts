import { http, HttpResponse } from "msw"
import { wireMeta } from "../../factories/wire"

export const metaHandlers = [
  http.get("*/api/v1/meta", () => HttpResponse.json(wireMeta())),
]
