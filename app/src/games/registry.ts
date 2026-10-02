// Every season the app can read. Old events keep rendering with their own module (game-module §1).
import type { GameDefinition } from "./types"

export const gameRegistry: Record<string, () => Promise<GameDefinition>> = {
  "2026-rebuilt": () => import("./2026-rebuilt/definition").then((m) => m.game),
}
