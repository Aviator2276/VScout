// GET /sync/stream fan-out (REQUIREMENTS §6.2a): a hint channel for clients without MQTT. Each
// connection receives the envelopes of its scopes that its viewer may read.
import type { ServerResponse } from "node:http"
import { canSee, logScopesFor } from "../domain/routing.js"
import type { Viewer } from "../domain/routing.js"
import type { CommittedBatch, Store } from "../domain/store.js"

interface Conn {
  res: ServerResponse
  viewer: Viewer
  scopes: Set<string>
  expiresAt: number
}

export class SseHub {
  private conns = new Set<Conn>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    store: Store,
    private now: () => number,
    private pingMs = 20_000
  ) {
    store.onCommit((b) => this.deliver(b))
  }

  get size() {
    return this.conns.size
  }

  open(res: ServerResponse, viewer: Viewer, syncScopes: string[], expiresAt: number) {
    const scopes = new Set(syncScopes.flatMap((s) => logScopesFor(s, viewer)))
    const conn: Conn = { res, viewer, scopes, expiresAt }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    })
    res.write("retry: 2000\n: connected\n\n")
    this.conns.add(conn)
    res.on("close", () => this.conns.delete(conn))
    this.timer ??= setInterval(() => this.ping(), this.pingMs).unref()
  }

  private ping() {
    const now = this.now()
    for (const c of this.conns) {
      // the token behind the stream expired: close it, the client reconnects with a new token
      if (c.expiresAt <= now) {
        c.res.end()
        this.conns.delete(c)
      } else c.res.write(": ping\n\n")
    }
  }

  private deliver(batch: CommittedBatch) {
    if (!this.conns.size) return
    for (const c of this.conns) {
      const sent = new Set<unknown>()
      for (const ch of batch.changes) {
        if (sent.has(ch.envelope)) continue
        const ok = ch.targets.some(
          (t) => c.scopes.has(t.scope) && canSee({ audience: t.audience, exclude_user: t.excludeUser ?? null }, c.viewer)
        )
        if (ok) {
          sent.add(ch.envelope)
          c.res.write(`data: ${JSON.stringify(ch.envelope)}\n\n`)
        }
      }
    }
  }

  closeAll() {
    for (const c of this.conns) c.res.end()
    this.conns.clear()
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
