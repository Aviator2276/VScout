// Idempotency-Key handling (REQUIREMENTS §7.1). Shared by HTTP and MQTT RPC, so a key first seen
// on one transport replays on the other.
import type { Db } from "../db/db.js"
import type { Clock } from "../lib/clock.js"
import { canonicalJson, sha256 } from "../lib/json.js"
import { problem, HttpProblem } from "../lib/problem.js"

export interface StoredReply {
  status: number
  body: unknown
  headers?: Record<string, string>
}

interface IdemRow {
  user_id: string
  key: string
  request_hash: string
  state: "in_flight" | "done"
  status: number | null
  body: string | null
  headers: string | null
  created_at: number
}

const IN_FLIGHT_STALE_MS = 120_000
export const IDEMPOTENCY_RETENTION_MS = 8 * 86_400_000

/** Problems that describe the moment, not the request: never stored, so a retry runs again. */
const TRANSIENT = new Set([401, 408, 425, 426, 429])

export function requestHash(method: string, path: string, query: Record<string, unknown>, body: unknown): string {
  const q = Object.keys(query)
    .filter((k) => k !== "access_token")
    .sort()
    .map((k) => `${k}=${String(query[k])}`)
    .join("&")
  return sha256(`${method.toUpperCase()} ${path}?${q} ${canonicalJson(body ?? null)}`)
}

export class Idempotency {
  constructor(
    private db: Db,
    private clock: Clock
  ) {}

  /**
   * Runs `fn` at most once per (user, key). Same key + same request → the stored reply;
   * same key + different request → 422; still running → 409 request_in_progress.
   */
  async run(userId: string, key: string | undefined, hash: string, fn: () => Promise<StoredReply> | StoredReply): Promise<StoredReply> {
    if (!key) throw problem(400, "validation_failed", { detail: "Idempotency-Key header required", errors: [{ path: "Idempotency-Key", code: "required" }] })
    if (key.length > 128) throw problem(400, "validation_failed", { detail: "Idempotency-Key too long" })
    const now = this.clock.now()
    const existing = this.db.get<IdemRow>("SELECT * FROM idempotency WHERE user_id = ? AND key = ?", userId, key)
    if (existing) {
      if (existing.request_hash !== hash) throw problem(422, "idempotency_key_reuse")
      if (existing.state === "done")
        return {
          status: existing.status ?? 200,
          body: existing.body === null ? null : JSON.parse(existing.body),
          ...(existing.headers ? { headers: JSON.parse(existing.headers) as Record<string, string> } : {}),
        }
      if (now - existing.created_at < IN_FLIGHT_STALE_MS)
        throw problem(409, "request_in_progress", { current: null }, { "Retry-After": "1" })
    }
    this.db.run(
      `INSERT INTO idempotency (user_id, key, request_hash, state, created_at) VALUES (?, ?, ?, 'in_flight', ?)
       ON CONFLICT(user_id, key) DO UPDATE SET request_hash = excluded.request_hash, state = 'in_flight', created_at = excluded.created_at`,
      userId,
      key,
      hash,
      now
    )
    let reply: StoredReply
    try {
      reply = await fn()
    } catch (e) {
      if (e instanceof HttpProblem && e.status < 500 && !TRANSIENT.has(e.status) && e.code !== "request_in_progress") {
        reply = { status: e.status, body: e.body(), headers: e.headers }
        this.store(userId, key, reply)
        throw e
      }
      this.db.run("DELETE FROM idempotency WHERE user_id = ? AND key = ?", userId, key)
      throw e
    }
    if (reply.status >= 500 || TRANSIENT.has(reply.status))
      this.db.run("DELETE FROM idempotency WHERE user_id = ? AND key = ?", userId, key)
    else this.store(userId, key, reply)
    return reply
  }

  private store(userId: string, key: string, reply: StoredReply) {
    this.db.run(
      "UPDATE idempotency SET state = 'done', status = ?, body = ?, headers = ? WHERE user_id = ? AND key = ?",
      reply.status,
      reply.body === undefined || reply.body === null ? null : JSON.stringify(reply.body),
      reply.headers && Object.keys(reply.headers).length ? JSON.stringify(reply.headers) : null,
      userId,
      key
    )
  }

  prune() {
    this.db.run("DELETE FROM idempotency WHERE created_at < ?", this.clock.now() - IDEMPOTENCY_RETENTION_MS)
  }
}
