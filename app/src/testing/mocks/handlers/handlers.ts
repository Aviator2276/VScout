import type { RequestHandler } from "msw"

/** Every domain's handlers, combined. Phase 1 adds meta, auth, sync, … */
export const handlers: Array<RequestHandler> = []
