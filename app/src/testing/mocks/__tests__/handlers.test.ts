import { beforeEach, describe, expect, it } from "vitest"
import { decodeMeta } from "@/lib/api/adapters/meta-adapter"
import { decodeSession } from "@/lib/api/adapters/session-adapter"
import { decodeSyncChanges } from "@/lib/api/adapters/sync-changes-adapter"
import { resetIds, testId } from "../../factories/ids"
import { wireEnvelope, wireMatch } from "../../factories/wire"
import { MOCK_CREDENTIALS, MOCK_GUEST_CODE, mockBackend } from "../mock-backend"

const API = "http://localhost/api/v1"
const post = (path: string, body: unknown) =>
  fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  mockBackend.reset()
  resetIds()
})

describe("MSW handlers answer with contract-valid bodies", () => {
  it("GET /meta", async () => {
    expect(decodeMeta(await (await fetch(`${API}/meta`)).json()).ok).toBe(true)
  })

  it("POST /auth/login accepts the mock credentials and rejects others", async () => {
    const device = { deviceId: testId(1), deviceName: "Test" }
    const ok = await post("/auth/login", { ...MOCK_CREDENTIALS, ...device })
    expect(decodeSession(await ok.json()).ok).toBe(true)
    const bad = await post("/auth/login", {
      username: "alex",
      password: "nope",
      ...device,
    })
    expect(bad.status).toBe(401)
    expect(await bad.json()).toMatchObject({ code: "invalid_credentials" })
  })

  it("POST /auth/guest scopes the session to the code's event", async () => {
    const res = await post("/auth/guest", {
      code: MOCK_GUEST_CODE.toLowerCase(),
      deviceId: testId(1),
      deviceName: "Pit",
    })
    const s = decodeSession(await res.json())
    expect(s.ok && s.value).toMatchObject({
      eventKey: "2026casj",
      user: { role: "guest" },
    })
    const bad = await post("/auth/guest", {
      code: "ZZZZZZ",
      deviceId: testId(1),
      deviceName: "Pit",
    })
    expect(await bad.json()).toMatchObject({
      status: 401,
      code: "invalid_guest_code",
    })
  })

  it("GET /sync/changes pages through the change log with cursors", async () => {
    for (let n = 1; n <= 3; n++)
      mockBackend.append(
        "event:2026casj",
        "match",
        wireEnvelope("match", wireMatch({ matchNumber: n }))
      )
    const get = async (cursors: Record<string, string>) => {
      const q = new URLSearchParams({
        scope: "event:2026casj",
        entities: "match",
        cursors: JSON.stringify(cursors),
        limit: "2",
      })
      const r = decodeSyncChanges(
        await (await fetch(`${API}/sync/changes?${q}`)).json()
      )
      if (!r.ok) throw r.error
      return r.value
    }
    const first = await get({})
    expect(first.changes).toHaveLength(2)
    expect(first.hasMore).toBe(true)
    const second = await get(first.cursors)
    expect(second.changes.map((c) => c.id)).toEqual(["2026casj_qm3"])
    expect(second.hasMore).toBe(false)
  })
})
