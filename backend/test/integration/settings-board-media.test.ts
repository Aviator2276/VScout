import http from "node:http"
import type { AddressInfo } from "node:net"
import sharp from "sharp"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { EVENT, harness, id } from "../helpers.js"
import type { Harness, Session } from "../helpers.js"

let h: Harness
let sam: Session
beforeEach(async () => {
  h = await harness()
  sam = await h.user("sam")
})
afterEach(async () => h.close())

describe("userSettings", () => {
  it("merges top-level keys, keeps unknown keys, and deletes keys patched to null", async () => {
    const cur = await h.req({ method: "GET", url: "/api/v1/me/settings", as: sam })
    expect(cur.body).toMatchObject({ id: sam.userId, userId: sam.userId, rev: 1 })
    const r = await h.req({
      method: "PATCH",
      url: "/api/v1/me/settings",
      as: sam,
      body: { baseRev: 1, patch: { appBackground: "shape:bubbles", homeLayout: { widgets: [{ id: "a", color: "teal", config: { x: 1 } }] }, futureKey: [1, 2], theme: "dark" } },
    })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ rev: 2, appBackground: "shape:bubbles", futureKey: [1, 2] })
    expect(r.body.homeLayout.widgets[0].config).toEqual({ x: 1 })
    const r2 = await h.req({ method: "PATCH", url: "/api/v1/me/settings", as: sam, body: { baseRev: 2, patch: { theme: null, rev: 77, userId: "evil" } } })
    expect(r2.body.theme).toBeUndefined()
    expect(r2.body).toMatchObject({ rev: 3, userId: sam.userId, futureKey: [1, 2] })
  })

  it("409 rev_conflict carries the complete record, even for a never-written document", async () => {
    const kim = await h.user("kim")
    h.s.db.run("DELETE FROM records WHERE entity = 'userSettings' AND id = ?", kim.userId)
    const r = await h.req({ method: "PATCH", url: "/api/v1/me/settings", as: kim, body: { baseRev: 5, patch: { theme: "dark" } } })
    expect(r.status).toBe(409)
    expect(r.body.current).toMatchObject({ id: kim.userId, userId: kim.userId, rev: 1 })
    expect(r.body.current.updatedAt).toBeTruthy()
  })

  it("publishes settings only on the user's own topic", async () => {
    h.link.clear()
    await h.req({ method: "PATCH", url: "/api/v1/me/settings", as: sam, body: { baseRev: 1, patch: { theme: "dark" } } })
    expect(h.link.messages.filter((m) => m.payload.entity === "userSettings").map((m) => m.topic)).toEqual([`vscout/user/${sam.userId}/data/userSettings`])
  })
})

describe("team and event settings", () => {
  it("admins set the team number once for everyone", async () => {
    const no = await h.req({ method: "PUT", url: "/api/v1/team-settings", as: sam, body: { baseRev: 1, record: { teamNumber: 2276 } } })
    expect(no.status).toBe(403)
    const r = await h.req({ method: "PUT", url: "/api/v1/team-settings", as: h.admin, body: { baseRev: 1, record: { teamNumber: 2276 } } })
    expect(r.body).toMatchObject({ id: "team", rev: 2, teamNumber: 2276 })
    expect(h.link.on("vscout/global/data/teamSettings")).toHaveLength(1)
    const stale = await h.req({ method: "PUT", url: "/api/v1/team-settings", as: h.admin, body: { baseRev: 1, record: { teamNumber: 1 } } })
    expect(stale.status).toBe(409)
    const me = await h.req({ method: "GET", url: "/api/v1/me", as: sam })
    expect(me.body.user.teamNumber).toBe(2276)
  })

  it("event settings are admin-only and keep opaque keys", async () => {
    const r = await h.req({ method: "PUT", url: `/api/v1/events/${EVENT}/settings`, as: h.admin, body: { baseRev: 1, record: { gameOverrides: { rp: 9 }, postScouting: { openEarly: true }, followedPicklistId: null } } })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ rev: 2, gameOverrides: { rp: 9 }, postScouting: { openEarly: true }, guestAccess: { enabled: false } })
    expect((await h.req({ method: "PUT", url: `/api/v1/events/${EVENT}/settings`, as: sam, body: { baseRev: 2, record: {} } })).status).toBe(403)
  })
})

describe("live alliance board", () => {
  async function seedRanks() {
    const teams = [254, 1678, 971, 118, 2056, 4414, 1323, 6328, 3476, 973, 5940, 604]
    h.s.store.tx(() => {
      teams.forEach((t, i) => {
        h.s.store.put("eventTeam", { id: `${EVENT}_${t}`, rev: 1, updatedAt: new Date(h.clock.now()).toISOString(), eventKey: EVENT, teamNumber: t, rank: i + 1, stats: {} }, { source: "import" })
      })
    })
    h.s.board.refreshCaptains(EVENT)
    return teams
  }
  const act = (as: Session, baseRev: number, action: Record<string, unknown>, actionId = id()) =>
    h.req({ method: "POST", url: `/api/v1/events/${EVENT}/alliance-board/actions`, as, body: { id: actionId, baseRev, action }, key: actionId })

  it("picks with serpentine rules, rejects stale revs with current, and undoes", async () => {
    await seedRanks()
    const board = h.s.store.live("allianceBoard", EVENT)
    expect(board?.alliances).toHaveLength(8)
    expect((board?.alliances as Array<{ captain: number }>)[0]?.captain).toBe(254)
    const rev = board?.rev as number
    const pickId = id()
    const p1 = await act(sam, rev, { kind: "pick", seed: 1, team: 3476 }, pickId)
    expect(p1.status).toBe(200)
    expect(p1.body.alliances[0].picks).toEqual([3476])
    expect(p1.body.status).toBe("inProgress")
    expect(p1.body.history[0]).toMatchObject({ id: pickId, actorId: sam.userId, kind: "pick", team: 3476, seed: 1 })
    const stale = await act(h.admin, rev, { kind: "pick", seed: 1, team: 973 })
    expect(stale.status).toBe(409)
    expect(stale.body.current.alliances[0].picks).toEqual([3476])
    // picking seed 2's captain moves everyone below up and refills seed 8 from the rankings
    const p2 = await act(sam, p1.body.rev, { kind: "pick", seed: 1, team: 1678 })
    expect(p2.status).toBe(200)
    expect(p2.body.alliances[0].picks).toEqual([3476, 1678])
    expect(p2.body.alliances[1].captain).toBe(971)
    expect(p2.body.alliances[7].captain).toBe(973)
    // a full alliance can't pick again
    expect((await act(sam, p2.body.rev, { kind: "pick", seed: 1, team: 5940 })).body.errors[0].code).toBe("full")
    const dec = await act(sam, p2.body.rev, { kind: "decline", team: 5940 })
    expect(dec.body.declined).toEqual([5940])
    const undo = await act(sam, dec.body.rev, { kind: "undo", actionId: dec.body.history[2].id })
    expect(undo.status).toBe(200)
    expect(undo.body.declined).toEqual([])
    expect(undo.body.alliances[0].picks).toEqual([3476, 1678])
    expect(undo.body.alliances[1].captain).toBe(971)
  })

  it("only admins lock; while locked only admins record; guests can't act", async () => {
    await seedRanks()
    const rev = h.s.store.live("allianceBoard", EVENT)?.rev as number
    expect((await act(sam, rev, { kind: "lock" })).status).toBe(403)
    const locked = await act(h.admin, rev, { kind: "lock" })
    expect(locked.body).toMatchObject({ locked: true, lockedBy: h.admin.userId })
    expect((await act(sam, locked.body.rev, { kind: "pick", seed: 1, team: 3476 })).body.code).toBe("forbidden")
    expect((await act(h.admin, locked.body.rev, { kind: "pick", seed: 1, team: 3476 })).status).toBe(200)
  })

  it("a scouter can undo only their own last action", async () => {
    await seedRanks()
    const kim = await h.user("kim")
    const rev = h.s.store.live("allianceBoard", EVENT)?.rev as number
    const a = await act(sam, rev, { kind: "pick", seed: 1, team: 3476 })
    const b = await act(kim, a.body.rev, { kind: "pick", seed: 2, team: 973 })
    expect((await act(kim, b.body.rev, { kind: "undo", actionId: a.body.history[0].id })).status).toBe(403)
    expect((await act(sam, b.body.rev, { kind: "undo", actionId: a.body.history[0].id })).status).toBe(200)
  })
})

describe("robot photos", () => {
  async function upload(as: Session, mediaId: string, img: Buffer, mime = "image/jpeg") {
    const boundary = "----vscout"
    const part = (name: string, value: string) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    const payload = Buffer.concat([
      Buffer.from(part("id", mediaId) + part("kind", "robotPhoto") + part("teamNumber", "254")),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="p.jpg"\r\nContent-Type: ${mime}\r\n\r\n`),
      img,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    const res = await h.app.inject({
      method: "POST",
      url: `/api/v1/events/${EVENT}/media`,
      headers: { authorization: `Bearer ${as.token}`, "content-type": `multipart/form-data; boundary=${boundary}`, "idempotency-key": `k-${mediaId}` },
      payload,
    })
    return { status: res.statusCode, body: JSON.parse(res.body) }
  }

  it("uploads, thumbnails, serves with ranges, and lets pit entries reference it", async () => {
    const img = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#ff0000" } }).jpeg().toBuffer()
    const mediaId = id()
    const r = await upload(sam, mediaId, img)
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ id: mediaId, rev: 1, mime: "image/jpeg", width: 64, height: 48, bytes: img.length, kind: "robotPhoto" })
    expect(r.body.url).toBe(`https://api.test/api/v1/media-files/${mediaId}.jpg`)
    const again = await upload(sam, mediaId, img)
    expect(again.body).toEqual(r.body)
    const file = await h.app.inject({ method: "GET", url: `/api/v1/media-files/${mediaId}.jpg`, headers: { range: "bytes=0-9", origin: "https://app.test" } })
    expect(file.statusCode).toBe(206)
    expect(file.headers["access-control-allow-origin"]).toBe("https://app.test")
    const thumb = await h.app.inject({ method: "GET", url: `/api/v1/media-files/${mediaId}_thumb.webp` })
    expect(thumb.statusCode).toBe(200)
    const pit = await h.req({
      method: "POST",
      url: `/api/v1/events/${EVENT}/pit-scouting`,
      as: sam,
      body: { id: id(), teamNumber: 254, gameId: "2026-rebuilt", schemaVersion: 1, data: {}, robot: { drivetrain: "swerve" }, photos: [mediaId] },
    })
    expect(pit.status).toBe(201)
  })

  it("rejects files that aren't JPEG or WebP", async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).png().toBuffer()
    const r = await upload(sam, id(), png, "image/png")
    expect(r.status).toBe(422)
  })
})

describe("SSE change stream", () => {
  it("streams envelopes the viewer may read and nothing else", async () => {
    await h.app.listen({ port: 0, host: "127.0.0.1" })
    const port = (h.app.server.address() as AddressInfo).port
    const kim = await h.user("kim")
    const chunks: string[] = []
    const req = http.get(`http://127.0.0.1:${port}/api/v1/sync/stream?scopes=user,event:${EVENT}&access_token=${kim.token}`)
    const res = await new Promise<http.IncomingMessage>((r) => req.on("response", r))
    expect(res.statusCode).toBe(200)
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/)
    res.on("data", (c: Buffer) => chunks.push(c.toString()))
    await new Promise((r) => setTimeout(r, 50))
    const visible = await h.req({ method: "POST", url: `/api/v1/events/${EVENT}/comments`, as: sam, body: { id: id(), teamNumber: 254, body: "hi" } })
    const hidden = await h.req({ method: "POST", url: `/api/v1/events/${EVENT}/comments`, as: sam, body: { id: id(), teamNumber: 254, body: "secret", visibility: "private" } })
    await new Promise((r) => setTimeout(r, 50))
    req.destroy()
    const text = chunks.join("")
    expect(text).toContain(visible.body.id)
    expect(text).not.toContain(hidden.body.id)
    expect(text).toMatch(/^retry: 2000/m)
  })

  it("401 without a token", async () => {
    const r = await h.req({ method: "GET", url: "/api/v1/sync/stream?scopes=global" })
    expect(r.status).toBe(401)
  })
})
