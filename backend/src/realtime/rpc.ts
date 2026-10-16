// MQTT 5 request/response (REQUIREMENTS §9.10). Each request becomes an in-process HTTP request
// through the same Fastify routes, so status codes, problem bodies, idempotency, the version gate
// and authorization filtering are identical on both transports.
import { z } from "zod"
import type { Guard } from "../auth/guard.js"
import { HttpProblem } from "../lib/problem.js"

export const MAX_RPC_REQUEST = 256 * 1024
export const MAX_RPC_RESPONSE = 1024 * 1024

const rpcRequest = z.object({
  v: z.literal(1),
  id: z.string().min(1).max(64),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().startsWith("/").max(2000),
  query: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.unknown().optional(),
})

export interface InjectResult {
  statusCode: number
  headers: Record<string, string | string[] | number | undefined>
  body: string
}

export type Inject = (opts: {
  method: string
  url: string
  headers: Record<string, string>
  payload?: string
}) => Promise<InjectResult>

export interface RpcReply {
  topic: string
  payload: string
  correlationData?: Buffer
}

const PASS_HEADERS = ["authorization", "idempotency-key", "x-client-version", "if-match", "if-none-match"]
const RETURN_HEADERS: Record<string, string> = {
  "content-type": "Content-Type",
  date: "Date",
  "retry-after": "Retry-After",
  etag: "ETag",
  "x-request-id": "X-Request-Id",
}

export class RpcServer {
  private answered = new Map<string, number>()

  constructor(
    private guard: Guard,
    private inject: Inject,
    private rpcSecret: string,
    private now: () => number = Date.now
  ) {}

  /** Handles one request message; returns the reply to publish (or null to drop it). */
  async handle(topic: string, payload: Buffer, correlationData?: Buffer): Promise<RpcReply | null> {
    const m = /^vscout\/rpc\/req\/([^/]+)\/([^/]+)$/.exec(topic)
    if (!m) return null
    const [, userId, deviceId] = m as unknown as [string, string, string]
    // replies only ever go to the requester's own response topic
    const replyTopic = `vscout/rpc/res/${userId}/${deviceId}`
    const respond = (id: string, status: number, body: unknown, headers: Record<string, string> = {}): RpcReply => ({
      topic: replyTopic,
      payload: JSON.stringify({
        v: 1,
        id,
        status,
        headers: { "Content-Type": status >= 400 ? "application/problem+json" : "application/json", Date: new Date(this.now()).toUTCString(), ...headers },
        body: body ?? null,
      }),
      ...(correlationData ? { correlationData } : {}),
    })
    const problemBody = (status: number, code: string, detail?: string) => ({
      type: `https://vscout.app/errors/${code}`,
      title: code,
      status,
      code,
      ...(detail ? { detail } : {}),
    })

    let raw: unknown
    try {
      raw = JSON.parse(payload.toString("utf8"))
    } catch {
      return null
    }
    const idGuess = typeof (raw as { id?: unknown })?.id === "string" ? String((raw as { id: string }).id).slice(0, 64) : null
    if (payload.length > MAX_RPC_REQUEST)
      return idGuess ? respond(idGuess, 413, problemBody(413, "rpc_too_large", "Request over 256 KB; send it over HTTP")) : null
    const parsed = rpcRequest.safeParse(raw)
    if (!parsed.success) return idGuess ? respond(idGuess, 400, problemBody(400, "validation_failed", "Malformed RPC request")) : null
    const req = parsed.data

    // never answer one id twice (a redelivered QoS 1 message)
    const seenKey = `${userId}/${req.id}`
    this.sweep()
    if (this.answered.has(seenKey)) return null
    this.answered.set(seenKey, this.now())

    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.headers)) if (PASS_HEADERS.includes(k.toLowerCase())) headers[k.toLowerCase()] = v

    // authorize from the token in the request, never from the topic alone
    try {
      const p = await this.guard.fromHeader(headers.authorization)
      if (p.id !== userId || p.cid !== `vscout-${userId}-${deviceId}`)
        return respond(req.id, 403, problemBody(403, "forbidden", "Token doesn't match this RPC topic"))
    } catch (e) {
      if (e instanceof HttpProblem) return respond(req.id, e.status, e.body())
      throw e
    }

    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(req.query ?? {})) for (const one of Array.isArray(v) ? v : [v]) qs.append(k, one)
    const url = `/api/v1${req.path}${qs.size ? `${req.path.includes("?") ? "&" : "?"}${qs.toString()}` : ""}`
    const res = await this.inject({
      method: req.method,
      url,
      headers: {
        ...headers,
        "x-vscout-rpc": this.rpcSecret,
        ...(req.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(req.body !== undefined ? { payload: JSON.stringify(req.body) } : {}),
    })
    let body: unknown = null
    if (res.body) {
      try {
        body = JSON.parse(res.body)
      } catch {
        body = res.body
      }
    }
    const outHeaders: Record<string, string> = {}
    for (const [k, v] of Object.entries(res.headers)) {
      const name = RETURN_HEADERS[k.toLowerCase()]
      if (name && v !== undefined) outHeaders[name] = Array.isArray(v) ? v.join(", ") : String(v)
    }
    const reply = respond(req.id, res.statusCode, body, outHeaders)
    if (Buffer.byteLength(reply.payload) > MAX_RPC_RESPONSE)
      return respond(req.id, 413, problemBody(413, "rpc_too_large", "Response over 1 MiB; ask over HTTP"))
    return reply
  }

  private sweep() {
    if (this.answered.size < 5000) return
    const cutoff = this.now() - 10 * 60_000
    for (const [k, t] of this.answered) if (t < cutoff) this.answered.delete(k)
  }
}
