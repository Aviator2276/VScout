// What every route sees in `context` (routing-auth §3). The runtime is a function so creating the
// router (which the shell prerender does in Node) never builds it.
import type { GameDefinition } from "@/games/types"
import type { AppRuntime } from "./runtime"

export interface RouterContext {
  app: () => AppRuntime
  game: GameDefinition
}
