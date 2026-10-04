// The mock API's side of the local MQTT broker (FX-61, mqtt-contract §4 and §10). When a broker is
// running (`make broker`, or any Mosquitto on MOCK_MQTT_URL) the mock:
//   - publishes every change-log entry to its fan-out topics (routing: src/testing/mocks/mqtt-fanout.ts),
//     so other devices see writes at once even after the app switched from SSE to MQTT;
//   - answers RPC requests (vscout/rpc/req/+/+) through the same MSW handlers as HTTP.
// No broker: it retries quietly every few seconds and the mock works over HTTP as before.
import mqtt from "mqtt"

const RPC_MAX_BYTES = 1024 * 1024 // mqtt-contract §10.5
const RPC_HEADERS = ["content-type", "date", "retry-after", "etag"]
const SEEN_LIMIT = 2000

/**
 * @param {object} deps
 * @param {string} deps.url broker URL (mqtt://localhost:1883)
 * @param {any} deps.mockBackend the in-memory backend (append listeners, records, sessions)
 * @param {(entries: any[], lookup: Function, now: string) => Array<{topic: string, payload: object, qos: 0|1}>} deps.planFanout
 * @param {(request: Request) => Promise<Response>} deps.dispatch the HTTP pipeline
 * @param {string} deps.apiBase e.g. http://localhost:8787/api/v1
 */
export function startMqttBridge({
  url,
  mockBackend,
  planFanout,
  dispatch,
  apiBase,
}) {
  const client = mqtt.connect(url, {
    protocolVersion: 5,
    clientId: `vscout-mock-api-${process.pid}`,
    reconnectPeriod: 5000,
    connectTimeout: 3000,
  })
  let warned = false
  client.on("connect", () => {
    warned = false
    console.log(`[mock-api] MQTT ${url}: fan-out and RPC on`)
    // shared subscription: one answer per request even with two mock processes (§10.2 rule 1)
    client.subscribe("$share/api/vscout/rpc/req/+/+", { qos: 1 })
  })
  client.on("error", (error) => {
    if (warned) return
    warned = true
    console.log(
      `[mock-api] no MQTT broker at ${url} (${error.code ?? error.message}); HTTP only, retrying`
    )
  })

  const lookup = (entity, id) =>
    mockBackend.records.get(mockBackend.key(entity, id)) ??
    mockBackend.trash.get(mockBackend.key(entity, id))

  // One request (or a demo seed) appends in one synchronous burst: batch it so the bulk rule
  // (§4.3, > 50 changes → one resync) sees the whole burst.
  let pending = []
  mockBackend.appendListeners.add((entry) => {
    if (!client.connected) return
    if (pending.length === 0) setImmediate(flush)
    pending.push(entry)
  })
  function flush() {
    const burst = pending
    pending = []
    for (const { topic, payload, qos } of planFanout(
      burst,
      lookup,
      mockBackend.at()
    ))
      client.publish(topic, JSON.stringify(payload), { qos })
  }

  const seen = new Set()
  client.on("message", (topic, payload, packet) => {
    const [, kind, dir, userId, deviceId] = topic.split("/")
    if (kind !== "rpc" || dir !== "req" || !userId || !deviceId) return
    void answer(userId, payload, packet.properties ?? {})
  })

  async function answer(userId, payload, props) {
    if (!props.responseTopic) return
    let req
    try {
      req = JSON.parse(payload.toString("utf8"))
    } catch {
      return
    }
    if (typeof req?.id !== "string" || seen.has(req.id)) return // never answer twice (§10.2 rule 5)
    seen.add(req.id)
    if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value)

    const reply = (status, headers, body) =>
      client.publish(
        props.responseTopic,
        JSON.stringify({ v: 1, id: req.id, status, headers, body }),
        {
          qos: 1,
          properties: {
            correlationData: props.correlationData,
            contentType: "application/json",
            messageExpiryInterval: 30,
          },
        }
      )

    // the token must belong to the topic's user (§10.2 rule 2)
    const auth = req.headers?.Authorization ?? req.headers?.authorization ?? ""
    const token = auth.replace(/^Bearer\s+/i, "")
    const session = token.startsWith("mock-access.")
      ? mockBackend.sessions.get(token.slice("mock-access.".length))
      : undefined
    if (mockBackend.perDeviceSessions && session && session.userId !== userId) {
      reply(403, { "content-type": "application/json" }, { code: "forbidden" })
      return
    }

    const target = new URL(`${apiBase}${req.path}`)
    for (const [k, v] of Object.entries(req.query ?? {}))
      for (const one of [v].flat()) target.searchParams.append(k, String(one))
    const hasBody =
      req.body !== undefined && !["GET", "HEAD"].includes(req.method)
    const response = await dispatch(
      new Request(target, {
        method: req.method,
        headers: {
          ...req.headers,
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
        },
        body: hasBody ? JSON.stringify(req.body) : undefined,
      })
    )

    const headers = {}
    for (const name of RPC_HEADERS) {
      const value = response.headers.get(name)
      if (value) headers[name] = value
    }
    const text = await response.text()
    if (Buffer.byteLength(text) > RPC_MAX_BYTES) {
      reply(
        413,
        { "content-type": "application/json" },
        { code: "rpc_too_large" }
      )
      return
    }
    let body = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }
    reply(response.status, headers, body)
  }

  return client
}
