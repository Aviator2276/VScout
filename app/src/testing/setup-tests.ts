// Runs before every test file (both projects).
import "fake-indexeddb/auto"
import { afterAll, afterEach, beforeAll } from "vitest"
import { server } from "./mocks/server"

// Any request without a handler fails the test: components never fetch, and lib code
// must be tested against explicit handlers.
beforeAll(() => server.listen({ onUnhandledFrame: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
