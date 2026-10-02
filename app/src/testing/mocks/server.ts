// MSW server for Node tests. Handlers are added per domain in ./handlers/* (Phase 1) and the
// same handlers drive `pnpm dev:mock` and the docker mock API.
import { setupServer } from "msw/node"
import { handlers } from "./handlers/handlers"

export const server = setupServer(...handlers)
