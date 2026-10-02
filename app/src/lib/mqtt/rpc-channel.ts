// MQTT 5 request/response correlation (mqtt.md §9.2–9.3, §9.6). The connection manager (track 6)
// provides the RpcLink; this module only matches responses to requests.
import { rpcResponse } from "@/lib/contracts/rpc"
import type { RpcRequest, RpcResponse } from "@/lib/contracts/rpc"

export interface RpcPublishProps {
  responseTopic: string
  correlationData: Uint8Array
  contentType: "application/json"
  messageExpiryInterval: number
}

/** What the channel needs from an MQTT connection. */
export interface RpcLink {
  /** connected and the response topic's SUBACK granted in this session */
  isReady: () => boolean
  publish: (
    topic: string,
    payload: string,
    props: RpcPublishProps
  ) => Promise<void>
  /** response-topic messages; returns an unsubscribe */
  onResponse: (
    handler: (payload: string, correlationData?: Uint8Array) => void
  ) => () => void
  /** returns an unsubscribe */
  onDisconnect: (handler: () => void) => () => void
}

export type RpcErrorKind =
  "timeout" | "disconnected" | "not-ready" | "publish-failed" | "bad-response"

export class RpcError extends Error {
  readonly kind: RpcErrorKind
  constructor(kind: RpcErrorKind) {
    super(`rpc ${kind}`)
    this.name = "RpcError"
    this.kind = kind
  }
}

export const MAX_IN_FLIGHT = 4

interface Pending {
  resolve: (r: RpcResponse) => void
  reject: (e: RpcError) => void
  timer: ReturnType<typeof setTimeout>
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export interface RpcChannel {
  request: (req: RpcRequest, timeoutMs: number) => Promise<RpcResponse>
  isReady: () => boolean
  stats: () => { inFlight: number; queued: number; lateResponses: number }
  dispose: () => void
}

export function createRpcChannel(
  link: RpcLink,
  topics: { request: string; response: string }
): RpcChannel {
  const pending = new Map<string, Pending>()
  const queue: Array<() => void> = []
  let lateResponses = 0

  const release = () => {
    const next = queue.shift()
    if (next) next()
  }

  const settle = (id: string): Pending | undefined => {
    const p = pending.get(id)
    if (!p) return undefined
    clearTimeout(p.timer)
    pending.delete(id)
    release()
    return p
  }

  const offResponse = link.onResponse((payload, correlationData) => {
    let parsed: RpcResponse | null = null
    try {
      const r = rpcResponse.safeParse(JSON.parse(payload))
      parsed = r.success ? r.data : null
    } catch {
      parsed = null
    }
    const id = correlationData ? decoder.decode(correlationData) : parsed?.id
    if (!id) return
    const p = settle(id)
    if (!p) {
      lateResponses++ // arrived after its timeout, or not ours: dropped, never applied
      return
    }
    if (parsed && parsed.id === id) p.resolve(parsed)
    else p.reject(new RpcError("bad-response"))
  })

  const offDisconnect = link.onDisconnect(() => {
    for (const id of [...pending.keys()])
      settle(id)?.reject(new RpcError("disconnected"))
    for (const start of queue.splice(0)) start() // queued callers fail fast on not-ready
  })

  const request = (req: RpcRequest, timeoutMs: number) =>
    new Promise<RpcResponse>((resolve, reject) => {
      const start = () => {
        if (!link.isReady()) {
          reject(new RpcError("not-ready"))
          release()
          return
        }
        const timer = setTimeout(
          () => settle(req.id)?.reject(new RpcError("timeout")),
          timeoutMs
        )
        pending.set(req.id, { resolve, reject, timer })
        link
          .publish(topics.request, JSON.stringify(req), {
            responseTopic: topics.response,
            correlationData: encoder.encode(req.id),
            contentType: "application/json",
            messageExpiryInterval: Math.ceil(timeoutMs / 1000),
          })
          .catch(() => settle(req.id)?.reject(new RpcError("publish-failed")))
      }
      if (pending.size < MAX_IN_FLIGHT) start()
      else queue.push(start)
    })

  return {
    request,
    isReady: () => link.isReady(),
    stats: () => ({
      inFlight: pending.size,
      queued: queue.length,
      lateResponses,
    }),
    dispose: () => {
      offResponse()
      offDisconnect()
      for (const id of [...pending.keys()])
        settle(id)?.reject(new RpcError("disconnected"))
    },
  }
}
