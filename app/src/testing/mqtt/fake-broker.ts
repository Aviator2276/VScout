// In-memory stand-in for the broker + backend RPC dispatcher (testing.md, mqtt.md §9.10).
// serveRpc() answers RPC requests from the SAME MSW handlers as HTTP, so parity tests compare the
// two transports against one fake backend.
import { getResponse } from "msw"
import type { RequestHandler } from "msw"
import { rpcRequest } from "@/lib/contracts/rpc"
import type { RpcLink, RpcPublishProps } from "@/lib/mqtt/rpc-channel"
import { handlers as defaultHandlers } from "../mocks/handlers/handlers"
import { server } from "../mocks/server"

export interface FakeBrokerOptions {
  /** HTTP base the handlers match against */
  apiBase?: string
}

export class FakeBroker implements RpcLink {
  connected = true
  subscribed = true
  /** drop every response (simulates a timeout) */
  dropResponses = false
  /** reject publishes (PUBACK reason ≥ 128) */
  failPublish = false
  readonly published: Array<{
    topic: string
    payload: string
    props: RpcPublishProps
  }> = []
  private responseHandlers = new Set<
    (payload: string, correlationData?: Uint8Array) => void
  >()
  private disconnectHandlers = new Set<() => void>()
  private serving = false
  private readonly apiBase: string

  constructor(opts: FakeBrokerOptions = {}) {
    this.apiBase = opts.apiBase ?? "http://localhost/api/v1"
  }

  isReady = () => this.connected && this.subscribed

  publish = async (
    topic: string,
    payload: string,
    props: RpcPublishProps
  ): Promise<void> => {
    if (this.failPublish) throw new Error("PUBACK 135 not authorized")
    this.published.push({ topic, payload, props })
    if (this.serving) void this.answer(payload, props)
  }

  onResponse = (
    handler: (payload: string, correlationData?: Uint8Array) => void
  ) => {
    this.responseHandlers.add(handler)
    return () => this.responseHandlers.delete(handler)
  }

  onDisconnect = (handler: () => void) => {
    this.disconnectHandlers.add(handler)
    return () => this.disconnectHandlers.delete(handler)
  }

  /** Answer requests like the backend's RPC dispatcher: same handlers as HTTP. */
  serveRpc(): void {
    this.serving = true
  }

  disconnect(): void {
    this.connected = false
    for (const h of this.disconnectHandlers) h()
  }

  /** Deliver a raw response (tests for late, malformed or foreign responses). */
  deliver(payload: string, correlationData?: Uint8Array): void {
    for (const h of this.responseHandlers) h(payload, correlationData)
  }

  private async answer(payload: string, props: RpcPublishProps): Promise<void> {
    const response = await answerRpc(payload, this.apiBase)
    if (this.dropResponses) return
    this.deliver(response, props.correlationData)
  }
}

/** Answers one RPC request JSON like the backend dispatcher: the same MSW handlers as HTTP. */
export async function answerRpc(
  payload: string,
  apiBase = "http://localhost/api/v1"
): Promise<string> {
  const req = rpcRequest.parse(JSON.parse(payload))
  const url = new URL(apiBase + req.path)
  for (const [k, v] of Object.entries(req.query ?? {}))
    for (const value of Array.isArray(v) ? v : [v])
      url.searchParams.append(k, value)
  const request = new Request(url, {
    method: req.method,
    headers: {
      ...req.headers,
      // marks the path so a test handler can answer differently per transport
      "x-test-transport": "mqtt",
      ...(req.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
  })
  // includes per-test server.use() overrides, like the HTTP path
  const listed = server.listHandlers() as Array<RequestHandler>
  const res =
    (await getResponse(
      listed.length > 0 ? listed : defaultHandlers,
      request
    )) ?? Response.json({ status: 404, code: "not_found" }, { status: 404 })
  const text = await res.text()
  const headers: Record<string, string> = {}
  for (const name of ["content-type", "date", "retry-after", "etag"]) {
    const v = res.headers.get(name)
    if (v) headers[name] = v
  }
  return JSON.stringify({
    v: 1,
    id: req.id,
    status: res.status,
    headers,
    body: text ? (JSON.parse(text) as unknown) : null,
  })
}
