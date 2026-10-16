// GET /sync/changes (REQUIREMENTS §6.1–6.2). Cursors are change-log positions per entity:
//   "<seq>"            delta: everything after seq
//   "b<snap>.<after>"  bootstrap in progress: compacted state at or before snap, after `after`
// A bootstrap's final cursor is the snapshot point, so writes committed while paging replay next.
import type { Db } from "../db/db.js"
import { problem } from "../lib/problem.js"
import type { EntityName } from "./entities.js"
import { isEntityName } from "./entities.js"
import { canSee, logScopesFor } from "./routing.js"
import type { Viewer } from "./routing.js"
import type { Store } from "./store.js"

export interface ChangesQuery {
  scope: string
  entities: string[]
  cursors: Record<string, string>
  limit: number
  /** stop adding changes once the page passes this many bytes (MQTT RPC, §9.10 rule 5) */
  maxBytes?: number
}

export interface ChangesPage {
  changes: unknown[]
  cursors: Record<string, string>
  hasMore: boolean
}

interface LogRow {
  seq: number
  op: string
  audience: string
  exclude_user: string | null
  envelope: string
}

type Cursor = { kind: "delta"; after: number } | { kind: "boot"; snap: number; after: number }

export const HORIZON_KEY = "log_horizon"

function parseCursor(raw: string | undefined, head: number): Cursor {
  if (!raw) return { kind: "boot", snap: head, after: 0 }
  const boot = /^b(\d+)\.(\d+)$/.exec(raw)
  if (boot) return { kind: "boot", snap: Number(boot[1]), after: Number(boot[2]) }
  if (/^\d+$/.test(raw)) return { kind: "delta", after: Number(raw) }
  throw problem(400, "validation_failed", {
    errors: [{ path: "cursors", code: "invalid_cursor", message: "Unknown cursor" }],
  })
}

export function parseCursorsParam(raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null || raw === "") return {}
  if (typeof raw === "object" && !Array.isArray(raw)) return stringMap(raw)
  const text = String(raw)
  for (const candidate of [text, safeBase64(text)]) {
    if (!candidate) continue
    try {
      const v: unknown = JSON.parse(candidate)
      if (v && typeof v === "object" && !Array.isArray(v)) return stringMap(v)
    } catch {
      // try the next encoding
    }
  }
  throw problem(400, "validation_failed", {
    errors: [{ path: "cursors", code: "invalid_json", message: "cursors must be a JSON or base64url map" }],
  })
}

function safeBase64(s: string): string | null {
  try {
    return Buffer.from(s, "base64url").toString("utf8")
  } catch {
    return null
  }
}

function stringMap(v: object): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v))
    if (val !== null && val !== undefined && val !== "") out[k] = String(val)
  return out
}

export const SYNC_SCOPE_RE = /^(global|user|event:\d{4}[a-z0-9]+)$/

export class SyncReader {
  constructor(
    private db: Db,
    private store: Store
  ) {}

  horizon(): number {
    return Number(this.db.getMeta(HORIZON_KEY) ?? 0)
  }

  changes(viewer: Viewer, q: ChangesQuery): ChangesPage {
    const scopes = logScopesFor(q.scope, viewer)
    const head = this.store.head()
    const horizon = this.horizon()
    const entities = [...new Set(q.entities)].filter((e): e is EntityName => isEntityName(e))
    const out: unknown[] = []
    const cursors: Record<string, string> = {}
    let hasMore = false
    let bytes = 0
    let full = false

    for (const entity of entities) {
      const cursor = parseCursor(q.cursors[entity], head)
      if (cursor.kind === "delta" && cursor.after < horizon)
        throw problem(410, "cursor_expired", { detail: `Cursor for ${entity} is older than the change-log retention` })
      if (full) {
        cursors[entity] = q.cursors[entity] ?? `b${cursor.kind === "boot" ? cursor.snap : head}.0`
        hasMore = true
        continue
      }
      const room = q.limit - out.length
      const rows = this.page(scopes, entity, cursor, room)
      let last = cursor.after
      for (const row of rows) {
        if (row.op === "upsert" || cursor.kind === "delta") {
          if (canSee(row, viewer)) {
            if (q.maxBytes !== undefined) {
              const size = Buffer.byteLength(row.envelope)
              if (bytes + size > q.maxBytes && out.length > 0) {
                full = true
                break
              }
              bytes += size
            }
            out.push(JSON.parse(row.envelope))
          }
        }
        last = row.seq
      }
      const more = full || rows.length >= room
      if (cursor.kind === "boot") {
        cursors[entity] = more ? `b${cursor.snap}.${last}` : String(cursor.snap)
      } else {
        cursors[entity] = String(last)
      }
      if (more) hasMore = true
      if (out.length >= q.limit) full = true
    }
    return { changes: out, cursors, hasMore }
  }

  private page(scopes: string[], entity: EntityName, cursor: Cursor, limit: number): LogRow[] {
    if (limit <= 0) return []
    const inList = scopes.map(() => "?").join(", ")
    if (cursor.kind === "delta") {
      return this.db.all<LogRow>(
        `SELECT seq, op, audience, exclude_user, envelope FROM change_log
         WHERE scope IN (${inList}) AND entity = ? AND seq > ? ORDER BY seq LIMIT ?`,
        ...scopes,
        entity,
        cursor.after,
        limit
      )
    }
    return this.db.all<LogRow>(
      `SELECT c.seq, c.op, c.audience, c.exclude_user, c.envelope FROM change_log c
       WHERE c.scope IN (${inList}) AND c.entity = ? AND c.seq > ? AND c.seq <= ?
         AND c.seq = (SELECT MAX(c2.seq) FROM change_log c2
                      WHERE c2.scope = c.scope AND c2.entity = c.entity AND c2.record_id = c.record_id)
       ORDER BY c.seq LIMIT ?`,
      ...scopes,
      entity,
      cursor.after,
      cursor.snap,
      limit
    )
  }
}
