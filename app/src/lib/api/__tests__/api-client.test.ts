import { HttpResponse, http } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { createRpcChannel } from "@/lib/mqtt/rpc-channel"
import { createNetworkTelemetry } from "@/lib/network/network-telemetry"
import { seqIds } from "@/testing/db"
import { testId } from "@/testing/factories/ids"
import { wireEnvelope, wireMatch } from "@/testing/factories/wire"
import {
  MOCK_CREDENTIALS,
  MOCK_GUEST_CODE,
  mockBackend,
} from "@/testing/mocks/mock-backend"
import { server } from "@/testing/mocks/server"
import { FakeBroker } from "@/testing/mqtt/fake-broker"
import { createApiClient } from "../api-client"
import type { ApiClientDeps, RequestOptions } from "../api-client"
import { ApiError, OfflineError, parseRetryAfter } from "../errors"
import { TIMEOUTS } from "../transport/api-transport"
import { buildUrl, createHttpTransport } from "../transport/http-transport"
import { createMqttRpcTransport } from "../transport/mqtt-rpc-transport"
import { TransportHealth } from "../transport/select-transport"
import type { TransportMode } from "../transport/select-transport"

const API = "http://localhost/api/v1"

interface SetupOptions {
  mode?: TransportMode
  rpcEnabled?: boolean
  refresh?: () => Promise<boolean>
  timeouts?: typeof TIMEOUTS
}

function setup(o: SetupOptions = {}) {
  const broker = new FakeBroker()
  broker.serveRpc()
  const channel = createRpcChannel(broker, {
    request: "vscout/rpc/req/u/d",
    response: "vscout/rpc/res/u/d",
  })
  let token = "token-1"
  const deps: ApiClientDeps = {
    transports: {
      http: createHttpTransport({ baseUrl: API }),
      mqtt: createMqttRpcTransport({
        channel: () => channel,
        ids: seqIds("0190bbbb"),
        enabled: () => o.rpcEnabled ?? true,
      }),
    },
    health: new TransportHealth(),
    mode: () => o.mode ?? "auto",
    clock: { now: () => Date.now() },
    clientVersion: "2.0.0-alpha.0",
    accessToken: () => token,
    refresh:
      o.refresh ??
      (() => {
        token = "token-2"
        return Promise.resolve(true)
      }),
    ...(o.timeouts ? { timeouts: o.timeouts } : {}),
  }
  return { client: createApiClient(deps), broker, deps }
}

async function outcome(
  client: ReturnType<typeof setup>["client"],
  req: RequestOptions
) {
  try {
    const r = await client.request(req)
    return { status: r.status, body: r.body, transport: r.transport }
  } catch (e) {
    if (e instanceof ApiError)
      return { status: e.status, body: e.problem, transport: e.transport }
    throw e
  }
}

beforeEach(() => mockBackend.reset())

describe("transport parity (ADR-063): the same request gets the same status and body", () => {
  const requests: Array<[string, RequestOptions]> = [
    [
      "GET /meta",
      { method: "GET", path: "/meta", class: "delta", anonymous: true },
    ],
    ["GET /me", { method: "GET", path: "/me", class: "delta" }],
    [
      "GET /sync/changes",
      {
        method: "GET",
        path: "/sync/changes",
        class: "delta",
        query: { scope: "event:2026casj", entities: "match", cursors: "{}" },
      },
    ],
    [
      "400 bad scope",
      {
        method: "GET",
        path: "/sync/changes",
        class: "delta",
        query: { scope: "nope" },
      },
    ],
  ]

  it.each(requests)("%s", async (_name, req) => {
    mockBackend.append(
      "event:2026casj",
      "match",
      wireEnvelope("match", wireMatch())
    )
    const viaHttp = await outcome(setup({ mode: "http-only" }).client, req)
    const viaRpc = await outcome(setup({ mode: "prefer-mqtt" }).client, req)
    expect([viaHttp.transport, viaRpc.transport]).toEqual(["http", "mqtt"])
    expect(viaRpc.status).toBe(viaHttp.status)
    expect(viaRpc.body).toEqual(viaHttp.body)
  })
})

describe("api client", () => {
  it("sends the version, bearer and idempotency headers on both transports", async () => {
    const seen: Array<Record<string, string | null>> = []
    server.use(
      http.post(`${API}/echo`, ({ request }) => {
        seen.push({
          auth: request.headers.get("authorization"),
          version: request.headers.get("x-client-version"),
          key: request.headers.get("idempotency-key"),
        })
        return HttpResponse.json({ ok: true }, { status: 201 })
      })
    )
    for (const mode of ["http-only", "prefer-mqtt"] as const)
      await setup({ mode }).client.request({
        method: "POST",
        path: "/echo",
        class: "write",
        body: {},
        idempotencyKey: "op-1",
      })
    const expected = {
      auth: "Bearer token-1",
      version: "2.0.0-alpha.0",
      key: "op-1",
    }
    expect(seen).toEqual([expected, expected])
  })

  it("an RPC timeout retries over HTTP with the same key, and the server applies it once", async () => {
    const applied = new Set<string>()
    server.use(
      http.post(`${API}/events/:ek/comments`, ({ request }) => {
        applied.add(request.headers.get("idempotency-key") ?? "")
        return HttpResponse.json({ records: applied.size }, { status: 201 })
      })
    )
    const { client, broker } = setup({
      timeouts: { ...TIMEOUTS, write: { mqtt: 30, http: 2000 } },
    })
    broker.dropResponses = true // the server handled it, but the answer never arrives
    const res = await client.request({
      method: "POST",
      path: "/events/2026casj/comments",
      class: "write",
      body: { body: "hi" },
      idempotencyKey: "op-7",
    })
    expect(res.transport).toBe("http")
    expect(applied).toEqual(new Set(["op-7"]))
    expect(broker.published).toHaveLength(1)
  })

  it("refreshes once on 401 and retries with the new token", async () => {
    let calls = 0
    server.use(
      http.get(`${API}/me`, ({ request }) => {
        calls++
        return request.headers.get("authorization") === "Bearer token-2"
          ? HttpResponse.json({ ok: true })
          : HttpResponse.json(
              { status: 401, code: "token_expired" },
              { status: 401 }
            )
      })
    )
    const { client } = setup({ mode: "http-only" })
    expect(
      (await client.request({ method: "GET", path: "/me", class: "delta" }))
        .status
    ).toBe(200)
    expect(calls).toBe(2)
  })

  it("gives up when the refresh fails, and never refreshes for auth endpoints", async () => {
    server.use(
      http.get(`${API}/me`, () =>
        HttpResponse.json(
          { status: 401, code: "token_expired" },
          { status: 401 }
        )
      )
    )
    let refreshes = 0
    const { client } = setup({
      mode: "http-only",
      refresh: () => (refreshes++, Promise.resolve(false)),
    })
    await expect(
      client.request({ method: "GET", path: "/me", class: "delta" })
    ).rejects.toMatchObject({ status: 401 })
    await expect(
      client.request({
        method: "POST",
        path: "/auth/login",
        class: "auth",
        anonymous: true,
        body: { username: "x", password: "y", deviceId: "d", deviceName: "n" },
      })
    ).rejects.toMatchObject({ problem: { code: "invalid_credentials" } })
    expect(refreshes).toBe(1)
  })

  it("doesn't switch transports on a 5xx: the server is the problem, not the path", async () => {
    let hits = 0
    server.use(
      http.get(`${API}/flaky`, () => {
        hits++
        return HttpResponse.json(
          { status: 503, code: "unavailable" },
          { status: 503, headers: { "Retry-After": "2" } }
        )
      })
    )
    const { client, broker } = setup()
    const err = await client
      .request({ method: "GET", path: "/flaky", class: "delta" })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      status: 503,
      transport: "mqtt",
      retryAfterMs: 2000,
    })
    expect(hits).toBe(1)
    expect(broker.published).toHaveLength(1)
  })

  it("uses RPC when HTTP is blocked, and reports offline when both paths fail", async () => {
    // HTTP to the API is blocked at the venue; the broker path still reaches the same backend
    server.use(
      http.get(`${API}/meta`, ({ request }) =>
        request.headers.get("x-test-transport") === "mqtt"
          ? HttpResponse.json({ apiVersion: 1 })
          : HttpResponse.error()
      )
    )
    const { client, broker } = setup()
    // bootstrap prefers HTTP; the network error moves it to RPC
    const r = await outcome(client, {
      method: "GET",
      path: "/meta",
      class: "bootstrap",
      anonymous: true,
    })
    expect(r.transport).toBe("mqtt")
    broker.disconnect()
    await expect(
      client.request({
        method: "GET",
        path: "/meta",
        class: "live",
        anonymous: true,
      })
    ).rejects.toBeInstanceOf(OfflineError)
  })

  it("reports every attempt to the telemetry: direction, bytes, outcome, ping (ADR-079)", async () => {
    server.use(
      http.get(`${API}/meta`, ({ request }) =>
        request.headers.get("x-test-transport") === "mqtt"
          ? HttpResponse.json({ apiVersion: 1 })
          : HttpResponse.error()
      )
    )
    const { deps } = setup()
    const network = createNetworkTelemetry(() => Date.now())
    const client = createApiClient({ ...deps, telemetry: network })
    // HTTP fails at the transport level, then RPC answers: two attempts
    await client.request({
      method: "GET",
      path: "/meta",
      class: "bootstrap",
      anonymous: true,
      quiet: true,
    })
    const s = network.getSnapshot()
    expect(s.outcomes).toEqual([false, true])
    expect(s.transfers).toEqual([])
    expect(s.pingMs).not.toBeNull()
    expect(s.activeDown).toBe(0)
    // a body goes up and is listed
    await client
      .request({
        method: "POST",
        path: "/comments",
        class: "write",
        body: { body: "hi" },
      })
      .catch(() => undefined)
    expect(network.getSnapshot().transfers[0]).toMatchObject({
      dir: "up",
      label: "Save comments",
    })
  })

  it("sends nothing over MQTT when the backend lacks mqttRpc", async () => {
    const { client, broker } = setup({ mode: "prefer-mqtt", rpcEnabled: false })
    await client.request({
      method: "GET",
      path: "/meta",
      class: "write",
      anonymous: true,
    })
    expect(broker.published).toHaveLength(0)
  })

  it("retries over HTTP when the RPC response would be too large (413 rpc_too_large)", async () => {
    server.use(
      http.get(`${API}/big`, ({ request }) =>
        request.headers.get("x-test-transport") === "mqtt"
          ? HttpResponse.json(
              { status: 413, code: "rpc_too_large" },
              { status: 413 }
            )
          : HttpResponse.json({ big: true })
      )
    )
    const r = await setup({ mode: "prefer-mqtt" }).client.request({
      method: "GET",
      path: "/big",
      class: "delta",
    })
    expect(r).toMatchObject({ transport: "http", body: { big: true } })
  })

  it("logs in and signs guests in over HTTP only (cookie)", async () => {
    const { client, broker } = setup({ mode: "prefer-mqtt" })
    const device = { deviceId: testId(1), deviceName: "t" }
    const login = await client.request({
      method: "POST",
      path: "/auth/login",
      class: "auth",
      anonymous: true,
      body: { ...MOCK_CREDENTIALS, ...device },
    })
    const guest = await client.request({
      method: "POST",
      path: "/auth/guest",
      class: "auth",
      anonymous: true,
      body: { code: MOCK_GUEST_CODE, ...device },
    })
    expect([login.transport, guest.transport]).toEqual(["http", "http"])
    expect(broker.published).toHaveLength(0)
  })
})

describe("helpers", () => {
  it("builds URLs with repeated query values and keeps relative bases relative", () => {
    expect(buildUrl(API, "/x", { a: ["1", "2"], b: "3" })).toBe(
      `${API}/x?a=1&a=2&b=3`
    )
    expect(buildUrl("/api/v1", "/meta")).toBe("/api/v1/meta")
  })

  it("parses Retry-After seconds and dates", () => {
    expect(parseRetryAfter("3", 0)).toBe(3000)
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 0)).toBe(10_000)
    expect(parseRetryAfter("soon", 0)).toBeNull()
    expect(parseRetryAfter(undefined, 0)).toBeNull()
  })
})
