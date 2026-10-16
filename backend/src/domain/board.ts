// The live alliance selection board (REQUIREMENTS §5.5, §7.5): one per event, written only through
// actions. Picks follow the same rules as the app; undo replays the remaining actions.
import { iso } from "../lib/clock.js"
import { problem } from "../lib/problem.js"
import type { BoardAction } from "./contracts.js"
import type { Rec } from "./entities.js"
import { applyAction, initialBoard, replay } from "./selection-rules.js"
import type { Alliance, LocalAction } from "./selection-rules.js"
import type { Store } from "./store.js"
import type { Actor } from "./writes.js"

interface HistoryEntry {
  id: string
  actorId: string
  kind: string
  at: string
  team?: number
  seed?: number
  actionId?: string
  status?: string
  undone?: boolean
}

export function rankedTeams(store: Store, eventKey: string): number[] {
  return store
    .listLive("eventTeam", eventKey)
    .filter((t) => typeof t.rank === "number")
    .sort((a, b) => Number(a.rank) - Number(b.rank))
    .map((t) => Number(t.teamNumber))
}

export function newBoard(eventKey: string, ranked: number[], now: number): Rec {
  return {
    id: eventKey,
    eventKey,
    rev: 1,
    updatedAt: iso(now),
    alliances: initialBoard(ranked).alliances,
    declined: [],
    status: "notStarted",
    locked: false,
    lockedBy: null,
    lockedAt: null,
    history: [],
  }
}

/** Entries since the last reset that still count (picks and declines not undone). */
function activeMoves(history: HistoryEntry[]): HistoryEntry[] {
  let start = 0
  history.forEach((h, i) => {
    if (h.kind === "reset") start = i + 1
  })
  return history.slice(start).filter((h) => (h.kind === "pick" || h.kind === "decline") && !h.undone)
}

const toLocal = (h: HistoryEntry): LocalAction =>
  h.kind === "pick" ? { kind: "pick", seed: h.seed ?? 0, team: h.team ?? 0 } : { kind: "decline", team: h.team ?? 0 }

const ADMIN_ONLY = new Set(["lock", "unlock", "reset", "setStatus"])

export class AllianceBoard {
  constructor(private store: Store) {}

  apply(eventKey: string, req: { id: string; baseRev: number; action: BoardAction }, actor: Actor, opId?: string): Rec {
    if (actor.role === "guest") throw problem(403, "role_required")
    return this.store.tx(() => {
      const board = this.store.live("allianceBoard", eventKey)
      if (!board) throw problem(404, "not_found", { current: null })
      const a = req.action
      if (actor.role !== "admin" && (ADMIN_ONLY.has(a.kind) || board.locked === true))
        throw problem(403, "forbidden", { detail: board.locked ? "The board is locked" : "Admins only" })
      if (req.baseRev !== board.rev) throw problem(409, "rev_conflict", { current: board })

      const ranked = rankedTeams(this.store, eventKey)
      const now = iso(this.store.now())
      const history = [...((board.history as HistoryEntry[] | undefined) ?? [])].map((h) => ({ ...h }))
      let alliances = board.alliances as Alliance[]
      let declined = board.declined as number[]
      let locked = board.locked === true
      let lockedBy = (board.lockedBy as string | null | undefined) ?? null
      let lockedAt = (board.lockedAt as string | null | undefined) ?? null
      let status = String(board.status)
      const entry: HistoryEntry = { id: req.id, actorId: actor.id, kind: a.kind, at: now }

      switch (a.kind) {
        case "pick":
        case "decline": {
          const r = applyAction({ alliances, declined }, a, ranked)
          if (!r.ok) throw problem(422, "validation_failed", { detail: r.error, errors: [{ path: "action", code: r.error }] })
          alliances = r.board.alliances
          declined = r.board.declined
          entry.team = a.team
          if (a.kind === "pick") entry.seed = a.seed
          if (status === "notStarted") status = "inProgress"
          break
        }
        case "undo": {
          const moves = activeMoves(history)
          const target = moves.find((h) => h.id === a.actionId)
          if (!target) throw problem(422, "validation_failed", { detail: "Nothing to undo", errors: [{ path: "action.actionId", code: "unknown_action" }] })
          if (actor.role !== "admin") {
            const mine = moves.filter((h) => h.actorId === actor.id)
            if (mine.at(-1)?.id !== target.id) throw problem(403, "forbidden", { detail: "You can undo only your own last action" })
          }
          const original = history.find((h) => h.id === target.id)
          if (original) original.undone = true
          const b = replay(ranked, activeMoves(history).map(toLocal))
          alliances = b.alliances
          declined = b.declined
          entry.actionId = a.actionId
          break
        }
        case "reset": {
          const b = initialBoard(ranked)
          alliances = b.alliances
          declined = []
          status = "notStarted"
          break
        }
        case "setStatus":
          status = a.status
          entry.status = a.status
          break
        case "lock":
          locked = true
          lockedBy = actor.id
          lockedAt = now
          break
        case "unlock":
          locked = false
          lockedBy = null
          lockedAt = null
          break
      }
      history.push(entry)
      const next: Rec = {
        ...board,
        rev: board.rev + 1,
        updatedAt: now,
        alliances,
        declined,
        status,
        locked,
        lockedBy,
        lockedAt,
        history,
      }
      this.store.put("allianceBoard", next, { actorId: actor.id, opId })
      return next
    })
  }

  /** New rankings before selection starts: refresh the captains (import job). */
  refreshCaptains(eventKey: string): void {
    this.store.tx(() => {
      const board = this.store.live("allianceBoard", eventKey)
      if (!board) return
      const history = (board.history as HistoryEntry[] | undefined) ?? []
      if (activeMoves(history).length > 0 || board.status !== "notStarted") return
      const ranked = rankedTeams(this.store, eventKey)
      const alliances = initialBoard(ranked).alliances
      if (JSON.stringify(alliances) === JSON.stringify(board.alliances)) return
      this.store.put(
        "allianceBoard",
        { ...board, rev: board.rev + 1, updatedAt: iso(this.store.now()), alliances },
        { source: "import" }
      )
    })
  }
}
