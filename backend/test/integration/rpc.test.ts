import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { RpcServer } from "../../src/realtime/rpc.js"
import { EVENT, harness, id, scoutEntryBody } from "../helpers.js"
import type { Harness, Session } from "../helpers.js"

let h: Harness
let sam: Session
let rpc: RpcServer
beforeEach(async () => {
  h = await harness()
  sam = await h.user("sam")
  rpc = new RpcServer(h.s.guard, (o) => h.app.inject(o), h.ctx.rpcSecret)
})
afterEach(async () => h.close())

async function call(as: Session, req: Record<string, unknown>, topicUser = as.userId, topicDevice = as.deviceId) {
  const reply = await rpc.handle(
    `vscout/rpc/req/${topicUser}/${topicDevice}`,
    Buffer.from(JSON.stringify({ v: 1, id: id(), headers: { Authorization: `Bearer ${as.token}`, "X-Client-Version": "2.0.0" }, ...req })),
    Buffer.from("corr-1")
  )
  if (!reply) return null
  return { topic: reply.topic, corr: reply.correlationData?.toString(), ...(JSON.parse(reply.payload) as { status: number; body: any; headers: Record<string, string>; id: string }) }
}

const strip = (b: any) => {
  if (b && typeof b === "object") {
    const { requestId: _r, ...rest } = b
    return rest
  }
  return b
}

describe("MQTT RPC parity (REQUIREMENTS §9.10)", () => {
  it("creates over RPC with the same status and body as HTTP, and replays across transports", async () => {
    const key = id()
    const body = scoutEntryBody()
    const viaRpc = await call(sam, { method: "POST", path: `/events/${EVENT}/scout-entries`, body, headers: { Authorization: `Bearer ${sam.token}`, "Idempotency-Key": key } })
    expect(viaRpc?.status).toBe(201)
    expect(viaRpc?.topic).toBe(`vscout/rpc/res/${sam.userId}/${sam.deviceId}`)
    expect(viaRpc?.corr).toBe("corr-1")
    expect(viaRpc?.headers["Content-Type"]).toMatch(/application\/json/)
    const viaHttp = await h.req({ method: "POST", url: `/api/v1/events/${EVENT}/scout-entries`, as: sam, body, key })
    expect(viaHttp.status).toBe(201)
    expect(viaHttp.body).toEqual(viaRpc?.body)
  })

  it("errors match too: conflicts, roles, validation, version gate, expired tokens", async () => {
    const c = await h.req({ method: "POST", url: `/api/v1/events/${EVENT}/comments`, as: sam, body: { id: id(), teamNumber: 254, body: "x" } })
    const cases: Array<{ method: string; path: string; body?: unknown; headers?: Record<string, string> }> = [
      { method: "PUT", path: `/comments/${c.body.id}`, body: { baseRev: 9, record: c.body } },
      { method: "PUT", path: "/team-settings", body: { baseRev: 1, record: { teamNumber: 1 } } },
      { method: "POST", path: `/events/${EVENT}/comments`, body: { id: id(), teamNumber: -1, body: "" } },
      { method: "GET", path: "/me", headers: { "X-Client-Version": "1.0.0" } },
      { method: "GET", path: "/sync/changes?scope=bad" },
    ]
    for (const cs of cases) {
      const key = id()
      const headers = { Authorization: `Bearer ${sam.token}`, "Idempotency-Key": key, "X-Client-Version": "2.0.0", ...(cs.headers ?? {}) }
      const [path, qs] = cs.path.split("?")
      const query = qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined
      const r = await call(sam, { method: cs.method, path, ...(query ? { query } : {}), ...(cs.body ? { body: cs.body } : {}), headers })
      const http = await h.req({ method: cs.method, url: `/api/v1${cs.path}`, as: sam, ...(cs.body ? { body: cs.body } : {}), key, headers: { "x-client-version": headers["X-Client-Version"] } })
      expect({ path: cs.path, status: r?.status }).toEqual({ path: cs.path, status: http.status })
      expect(strip(r?.body)).toEqual(strip(http.body))
    }
  })

  it("syncs over RPC with the same envelopes", async () => {
    await h.req({ method: "POST", url: `/api/v1/events/${EVENT}/comments`, as: sam, body: { id: id(), teamNumber: 254, body: "x" } })
    const query = { scope: `event:${EVENT}`, entities: "comment,eventSettings", limit: "200" }
    const r = await call(sam, { method: "GET", path: "/sync/changes", query })
    const http = await h.req({ method: "GET", url: `/api/v1/sync/changes?${new URLSearchParams(query)}`, as: sam })
    expect(r?.status).toBe(200)
    expect(r?.body.changes).toEqual(http.body.changes)
    expect(r?.body.cursors).toEqual(http.body.cursors)
  })

  it("stops an RPC page at 512 KB with hasMore and a resumable cursor", async () => {
    const big = "x".repeat(3900)
    for (let i = 0; i < 160; i++) await h.req({ method: "POST", url: `/api/v1/events/${EVENT}/comments`, as: sam, body: { id: id(), teamNumber: 254, body: big } })
    const r = await call(sam, { method: "GET", path: "/sync/changes", query: { scope: `event:${EVENT}`, entities: "comment", limit: "200" } })
    expect(r?.status).toBe(200)
    expect(r?.body.hasMore).toBe(true)
    expect(r?.body.changes.length).toBeLessThan(160)
    expect(Buffer.byteLength(JSON.stringify(r?.body))).toBeLessThan(1024 * 1024)
    const rest = await call(sam, { method: "GET", path: "/sync/changes", query: { scope: `event:${EVENT}`, entities: "comment", limit: "200", cursors: JSON.stringify(r?.body.cursors) } })
    expect(r!.body.changes.length + rest!.body.changes.length).toBe(160)
  })

  it("refuses a token for another topic, HTTP-only endpoints, and answers each id once", async () => {
    const kim = await h.user("kim")
    const wrong = await call(sam, { method: "GET", path: "/me" }, kim.userId, kim.deviceId)
    expect(wrong?.status).toBe(403)
    expect(wrong?.topic).toBe(`vscout/rpc/res/${kim.userId}/${kim.deviceId}`)
    const httpOnly = await call(sam, { method: "POST", path: "/auth/refresh" })
    expect(httpOnly?.status).toBe(404)
    const msg = Buffer.from(JSON.stringify({ v: 1, id: "same-id", method: "GET", path: "/me", headers: { Authorization: `Bearer ${sam.token}` } }))
    expect(await rpc.handle(`vscout/rpc/req/${sam.userId}/${sam.deviceId}`, msg)).not.toBeNull()
    expect(await rpc.handle(`vscout/rpc/req/${sam.userId}/${sam.deviceId}`, msg)).toBeNull()
    const garbage = await call(sam, { method: "GET", path: "/me", headers: { Authorization: "Bearer garbage" } })
    expect(garbage?.status).toBe(401)
    expect(garbage?.body.code).toBe("token_invalid")
  })

  it("runs the board action over RPC first, then the HTTP retry with the same key replays", async () => {
    const rev = h.s.store.live("allianceBoard", EVENT)?.rev as number
    const actionId = id()
    const body = { id: actionId, baseRev: rev, action: { kind: "setStatus", status: "inProgress" } }
    const r = await call(h.admin, { method: "POST", path: `/events/${EVENT}/alliance-board/actions`, body, headers: { Authorization: `Bearer ${h.admin.token}`, "Idempotency-Key": actionId } })
    expect(r?.status).toBe(200)
    const http = await h.req({ method: "POST", url: `/api/v1/events/${EVENT}/alliance-board/actions`, as: h.admin, body, key: actionId })
    expect(http.status).toBe(200)
    expect(http.body).toEqual(r?.body)
    expect(h.s.store.live("allianceBoard", EVENT)?.rev).toBe(rev + 1)
  })
})
