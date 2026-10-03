import { beforeEach, describe, expect, it } from "vitest"
import { decodeSyncChanges } from "@/lib/api/adapters/sync-changes-adapter"
import { resetIds } from "../../factories/ids"
import { mockBackend } from "../mock-backend"

const API = "http://localhost/api/v1"
const send = (method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const ENTITIES = {
  global: "event,team",
  event:
    "match,eventTeam,scoutEntry,pitScouting,postScouting,comment,message,picklist,picklistEntry",
}

async function changes(scope: string) {
  const q = new URLSearchParams({
    scope,
    entities: scope === "global" ? ENTITIES.global : ENTITIES.event,
    cursors: "{}",
    limit: "2000",
  })
  const r = decodeSyncChanges(
    await (await fetch(`${API}/sync/changes?${q}`)).json()
  )
  if (!r.ok) throw r.error
  return r.value
}

const OPTIONS = { seed: 42, teams: 24, playedPercent: 50, coveragePercent: 80 }

beforeEach(() => {
  mockBackend.reset()
  resetIds()
})

describe("demo events (AD7a, FX-60)", () => {
  it("an admin creates a mid-event demo; every record decodes; Delete removes it", async () => {
    mockBackend.role = "admin"
    const res = await send("POST", "/admin/demo-events", OPTIONS)
    expect(res.status).toBe(201)
    const created = (await res.json()) as {
      eventKey: string
      counts: Record<string, number>
    }
    expect(created.eventKey).toBe("2026demo42")
    expect(created.counts.matches).toBe(40)
    expect(created.counts.scoutEntries).toBeGreaterThan(50)

    const event = await changes("event:2026demo42")
    expect(event.rejected).toEqual([])
    const played = event.changes.filter(
      (c) =>
        c.entity === "match" &&
        (c.record as { status?: string } | undefined)?.status === "played"
    )
    expect(played).toHaveLength(20)
    expect((await changes("global")).rejected).toEqual([])

    const del = await send("DELETE", "/admin/demo-events/2026demo42")
    expect(del.status).toBe(200)
    const after = await changes("event:2026demo42")
    expect(after.changes.some((c) => c.op === "delete")).toBe(true)
    expect((await send("DELETE", "/admin/demo-events/2026demo42")).status).toBe(
      404
    )
  })

  it("same seed, same event; scouters can't create one", async () => {
    mockBackend.role = "scouter"
    expect((await send("POST", "/admin/demo-events", OPTIONS)).status).toBe(403)
  })

  it("the dev server's saved state round-trips, demo events included (FX-61)", async () => {
    mockBackend.role = "admin"
    await send("POST", "/admin/demo-events", { ...OPTIONS, teams: 12 })
    const saved = JSON.parse(JSON.stringify(mockBackend.snapshot())) as unknown
    const log = mockBackend.log.length
    mockBackend.reset()
    expect(mockBackend.restore(saved)).toBe(true)
    expect(mockBackend.log).toHaveLength(log)
    expect([...mockBackend.demoEvents.keys()]).toEqual(["2026demo42"])
    mockBackend.role = "admin"
    expect((await send("DELETE", "/admin/demo-events/2026demo42")).status).toBe(
      200
    )
    expect(mockBackend.restore({ v: 2 })).toBe(false)
  })
})
