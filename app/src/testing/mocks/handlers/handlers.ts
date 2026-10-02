import type { RequestHandler } from "msw"
import { adminHandlers } from "./admin"
import { authHandlers } from "./auth"
import { metaHandlers } from "./meta"
import { pushHandlers } from "./push"
import { syncHandlers } from "./sync"
import { writeHandlers } from "./writes"

/** Every domain's handlers, combined. Later tracks add writes, push and admin endpoints. */
export const handlers: Array<RequestHandler> = [
  ...metaHandlers,
  ...authHandlers,
  ...syncHandlers,
  ...adminHandlers,
  ...writeHandlers,
  ...pushHandlers,
]
