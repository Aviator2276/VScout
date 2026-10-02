import type { RequestHandler } from "msw"
import { authHandlers } from "./auth"
import { metaHandlers } from "./meta"
import { syncHandlers } from "./sync"
import { writeHandlers } from "./writes"

/** Every domain's handlers, combined. Later tracks add writes, push and admin endpoints. */
export const handlers: Array<RequestHandler> = [
  ...metaHandlers,
  ...authHandlers,
  ...syncHandlers,
  ...writeHandlers,
]
