// The single switch point for the season (ADR-009). App code reads the active game from here.
import { game as rebuilt } from "@/games/2026-rebuilt/definition"
import { gameRegistry } from "@/games/registry"
import type { GameDefinition } from "@/games/types"

export const activeGame: GameDefinition = rebuilt

/** For events of another season (an old event viewed in a later year). */
export async function loadGame(gameId: string): Promise<GameDefinition | null> {
  if (gameId === activeGame.id) return activeGame
  const load = gameRegistry[gameId]
  return load ? load() : null
}
