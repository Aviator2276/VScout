import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { harness, id, pullAll } from "../helpers.js"
import type { Harness, Session } from "../helpers.js"
import { EK, nexusEvent, nexusMap, nexusPits, statbotics, tbaEvent, tbaMatches, tbaRankings, tbaTeams } from "../fixtures/upstream.js"

const TBA = "https://www.thebluealliance.com/api/v3"
const NEXUS = "https://frc.nexus/api/v1"

let h: Harness
let sam: Session
beforeEach(async () => {
  h = await harness({}, { event: false })
  sam = await h.user("sam")
  const u = h.upstream.routes
  u.set(`${TBA}/event/${EK}/teams`, tbaTeams)
  u.set(`${TBA}/event/${EK}/matches`, tbaMatches())
  u.set(`${TBA}/event/${EK}/rankings`, tbaRankings)
  u.set(`${TBA}/event/${EK}`, tbaEvent)
  u.set(`https://api.statbotics.io/v3/team_events?event=${EK}`, statbotics)
  u.set(`${NEXUS}/event/${EK}/pits`, nexusPits)
  u.set(`${NEXUS}/event/${EK}/map`, nexusMap)
  u.set(`${NEXUS}/event/${EK}`, nexusEvent(h.clock.now() - 10_000, h.clock.now() + 8 * 60_000))
})
afterEach(async () => h.close())

async function track() {
  const r = await h.req({ method: "POST", url: "/api/v1/admin/events", as: h.admin, body: { eventKey: EK } })
  expect(r.status).toBe(201)
  return r.body
}

describe("TBA / Statbotics / Nexus imports", () => {
  it("imports an event, its teams, matches, rankings, EPA and pits, and sets up the singletons", async () => {
    const r = await track()
    expect(r.event).toMatchObject({ id: EK, name: "Silicon Valley Regional", eventType: "regional", gameId: "2026-rebuilt", timezone: "America/Los_Angeles" })
    const qm1 = h.s.store.live("match", `${EK}_qm1`)
    expect(qm1).toMatchObject({ compLevel: "qm", matchNumber: 1, status: "played", winningAlliance: "red", videoKeys: ["youtube:abc"] })
    expect((qm1?.alliances as { red: { score: number; teamNumbers: number[] } }).red).toMatchObject({ score: 101, teamNumbers: [254, 1678, 2276] })
    expect((qm1?.scoreBreakdown as { red: object }).red).toEqual({ totalAutoPoints: 20, hubScore: { totalCount: 14 } })
    const qm2 = h.s.store.live("match", `${EK}_qm2`)
    expect(qm2).toMatchObject({ status: "queuing", nexusStatus: "Now queuing", predictedTime: new Date(h.clock.now() + 8 * 60_000).toISOString() })
    expect(qm2?.predictedAt).toBe(new Date(h.clock.now() - 10_000).toISOString())
    const et = h.s.store.live("eventTeam", `${EK}_254`)
    expect(et).toMatchObject({ rank: 1, record: { wins: 3, losses: 1, ties: 0 }, rankingPoints: 2.5, pitLocation: "A1" })
    expect((et?.stats as { epa: { total_points: { mean: number } } }).epa.total_points.mean).toBe(42.5)
    expect(h.s.store.live("team", "254")).toMatchObject({ teamNumber: 254, nickname: "Team 254" })
    expect(h.s.store.live("eventSettings", EK)).toMatchObject({ rev: 1, guestAccess: { enabled: false } })
    expect((h.s.store.live("allianceBoard", EK)?.alliances as Array<{ captain: number }>)[0]?.captain).toBe(254)
  })

  it("a re-import of unchanged data changes no revs and publishes nothing", async () => {
    await track()
    const before = await pullAll(h, sam, `event:${EK}`, ["match", "eventTeam"])
    h.s.publisher.flush()
    h.link.clear()
    await h.s.importer.full(EK)
    h.s.publisher.flush()
    expect(h.link.messages).toEqual([])
    const after = await pullAll(h, sam, `event:${EK}`, ["match", "eventTeam"], before.cursors)
    expect(after.changes).toEqual([])
  })

  it("more than 50 changed records publish one control resync instead", async () => {
    h.s.importer.track(EK)
    h.link.clear()
    await h.s.importer.run("event", EK)
    h.s.publisher.flush()
    const control = h.link.on(`vscout/event/${EK}/control`)
    expect(control).toHaveLength(1)
    expect(control[0]?.payload).toMatchObject({ cmd: "resync", reason: "bulk" })
    expect(h.link.on(`vscout/event/${EK}/data/eventTeam`)).toEqual([])
  })

  it("a small import publishes individual envelopes on the bulk lane", async () => {
    await track()
    h.s.publisher.flush()
    h.link.clear()
    h.upstream.routes.set(`${TBA}/event/${EK}/matches`, tbaMatches(2))
    expect(await h.s.importer.run("matches", EK)).toBe(1)
    h.s.publisher.flush()
    const msgs = h.link.on(`vscout/event/${EK}/data/match`)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]?.payload).toMatchObject({ id: `${EK}_qm2`, op: "upsert", rev: 3 })
    expect((msgs[0]?.payload.data as { status: string }).status).toBe("played")
    expect(msgs[0]?.payload).not.toHaveProperty("actorId")
  })

  it("keeps Nexus estimates stable across polls unless they move", async () => {
    await track()
    const rev = h.s.store.live("match", `${EK}_qm5`)?.rev
    h.clock.advance(30_000)
    h.upstream.routes.set(`${NEXUS}/event/${EK}`, nexusEvent(h.clock.now() - 5_000, h.clock.now() - 30_000 + 8 * 60_000))
    expect(await h.s.importer.run("nexus", EK)).toBe(0)
    expect(h.s.store.live("match", `${EK}_qm5`)?.rev).toBe(rev)
    // the event runs 5 minutes late: estimates move
    h.upstream.routes.set(`${NEXUS}/event/${EK}`, nexusEvent(h.clock.now(), h.clock.now() + 13 * 60_000))
    expect(await h.s.importer.run("nexus", EK)).toBeGreaterThan(5)
    expect(h.s.store.live("match", `${EK}_qm5`)?.rev).toBe((rev as number) + 1)
  })

  it("reports unknown Nexus statuses and keeps them raw", async () => {
    await track()
    h.link.clear()
    h.upstream.routes.set(`${NEXUS}/event/${EK}`, nexusEvent(h.clock.now(), h.clock.now() + 60_000, { 4: "Delayed by robot" }))
    await h.s.importer.run("nexus", EK)
    expect(h.s.store.live("match", `${EK}_qm4`)).toMatchObject({ nexusStatus: "Delayed by robot", status: "scheduled" })
    expect(h.link.on(`vscout/event/${EK}/admin/alerts`)[0]?.payload).toMatchObject({ kind: "importUnknownValue" })
  })

  it("an upstream failure publishes admin/alerts importFailed (throttled)", async () => {
    await track()
    h.link.clear()
    h.upstream.fail.add(`${TBA}/event/${EK}/matches`)
    await h.s.importer.run("matches", EK)
    await h.s.importer.run("matches", EK)
    const alerts = h.link.on(`vscout/event/${EK}/admin/alerts`)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.payload).toMatchObject({ kind: "importFailed", detail: { job: "matches", status: 500 } })
  })

  it("draws the pit map from Nexus and serves it with an ETag", async () => {
    await track()
    const r = await h.req({ method: "GET", url: `/api/v1/events/${EK}/pit-map`, as: sam })
    expect(r.status).toBe(200)
    expect(r.body.imageUrl).toMatch(new RegExp(`^https://api.test/api/v1/events/${EK}/pit-map.svg`))
    expect(r.body.pits).toHaveLength(6)
    expect(r.body.pits[0]).toMatchObject({ teamNumber: 254, w: 50, h: 40 })
    const etag = String(r.headers.etag)
    const again = await h.req({ method: "GET", url: `/api/v1/events/${EK}/pit-map`, as: sam, headers: { "if-none-match": etag } })
    expect(again.status).toBe(304)
    const svg = await h.app.inject({ method: "GET", url: `/api/v1/events/${EK}/pit-map.svg` })
    expect(svg.headers["content-type"]).toMatch(/image\/svg\+xml/)
    expect(svg.body).toContain(">254<")
  })

  it("creates a manual event when TBA doesn't have one", async () => {
    const r = await h.req({ method: "POST", url: "/api/v1/admin/events", as: h.admin, body: { eventKey: "2026scrim", name: "Scrimmage", startDate: "2026-05-01", endDate: "2026-05-01" } })
    expect(r.status).toBe(201)
    expect(r.body.event).toMatchObject({ id: "2026scrim", eventType: "offseason", manual: true })
  })
})

describe("push", () => {
  const p256 = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url")
  const auth = Buffer.alloc(16, 9).toString("base64url")
  const subscribe = (as: Session, endpoint = `https://fcm.googleapis.com/fcm/send/${as.deviceId}`) =>
    h.req({ method: "PUT", url: `/api/v1/push/subscriptions/${as.deviceId}`, as, body: { subscription: { endpoint, expirationTime: null, keys: { p256dh: p256, auth } }, platform: { os: "ios", standalone: true, declarative: true, appVersion: "2.0.0" } } })

  it("guards endpoints against SSRF and validates keys", async () => {
    for (const endpoint of ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://169.254.169.254/latest", "https://fcm.googleapis.com.evil.io/x"]) {
      const r = await subscribe(sam, endpoint)
      expect(r.body.code).toBe("invalid_endpoint")
    }
    const ok = await subscribe(sam, "https://web.push.apple.com/QGx")
    expect(ok.status).toBe(200)
    const badKeys = await h.req({ method: "PUT", url: `/api/v1/push/subscriptions/${sam.deviceId}`, as: sam, body: { subscription: { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "AAAA", auth } } } })
    expect(badKeys.body.code).toBe("invalid_keys")
  })

  it("moves an endpoint between devices, and a 410 deletes the subscription", async () => {
    await subscribe(sam, "https://fcm.googleapis.com/fcm/send/shared")
    const kim = await h.user("kim")
    await subscribe(kim, "https://fcm.googleapis.com/fcm/send/shared")
    const rows = h.s.db.all<{ device_id: string }>("SELECT device_id FROM push_subscriptions")
    expect(rows.map((r) => r.device_id)).toEqual([kim.deviceId])
    h.push.status.set("https://fcm.googleapis.com/fcm/send/shared", 410)
    await h.req({ method: "POST", url: "/api/v1/push/test", as: kim })
    expect(h.s.db.all("SELECT * FROM push_subscriptions")).toEqual([])
  })

  it("DMs and announcements notify once; a replayed write never notifies twice", async () => {
    h.s.importer.createManualEvent({ eventKey: EK, name: "SVR", startDate: "2026-03-19", endDate: "2026-03-22" })
    const kim = await h.user("kim")
    await subscribe(kim)
    await subscribe(sam)
    const key = id()
    const body = { id: id(), channelId: `dm:${[sam.userId, kim.userId].sort().join(":")}`, kind: "message", body: "see you\u0007 at the pits" }
    await h.req({ method: "POST", url: `/api/v1/events/${EK}/messages`, as: sam, body, key })
    await h.s.push.idle()
    await h.req({ method: "POST", url: `/api/v1/events/${EK}/messages`, as: sam, body, key })
    await h.s.push.idle()
    expect(h.push.sent).toHaveLength(1)
    const sent = h.push.sent[0]
    expect(sent?.endpoint).toContain(kim.deviceId)
    const n = sent?.payload.notification as Record<string, any>
    expect(sent?.payload.web_push).toBe(8030)
    expect(n.title).toBe("Sam")
    expect(n.body).toBe("see you at the pits")
    expect(n.navigate).toBe(`https://app.test/messages/${body.channelId}`)
    expect(n.renotify).toBe(true)
    expect(n.data).toMatchObject({ v: 1, kind: "message", uid: kim.userId, eventKey: EK, url: `/messages/${body.channelId}`, entity: { type: "message", id: body.id } })
    expect(n).not.toHaveProperty("app_badge")
    expect(sent?.opts).toMatchObject({ TTL: 21600, urgency: "normal" })
    expect(sent?.opts.topic).toMatch(/^[A-Za-z0-9_-]{1,32}$/)
    expect(Buffer.byteLength(JSON.stringify(sent?.payload))).toBeLessThanOrEqual(3000)

    h.push.sent = []
    await h.req({ method: "POST", url: `/api/v1/events/${EK}/messages`, as: h.admin, body: { id: id(), channelId: `event:${EK}`, kind: "announcement", priority: "urgent", body: "Robot inspection closes in 10 min" } })
    await h.s.push.idle()
    expect(h.push.sent).toHaveLength(2)
    expect((h.push.sent[0]?.payload.notification as { requireInteraction: boolean }).requireInteraction).toBe(true)
    expect(h.push.sent[0]?.opts).toMatchObject({ TTL: 900, urgency: "high" })
  })

  it("respects chat preferences: muted channels, mentions only, off", async () => {
    h.s.importer.createManualEvent({ eventKey: EK, name: "SVR", startDate: "2026-03-19", endDate: "2026-03-22" })
    const kim = await h.user("kim")
    const jo = await h.user("jo")
    for (const s of [kim, jo, sam, h.admin]) await subscribe(s)
    await h.req({ method: "PATCH", url: "/api/v1/me/settings", as: kim, body: { baseRev: 1, patch: { notifications: { eventChat: "mentions" } } } })
    await h.req({ method: "PATCH", url: "/api/v1/me/settings", as: jo, body: { baseRev: 1, patch: { notifications: { mutedChannelIds: [`event:${EK}`] } } } })
    await h.req({ method: "POST", url: `/api/v1/events/${EK}/messages`, as: sam, body: { id: id(), channelId: `event:${EK}`, kind: "message", body: "lunch?" } })
    await h.s.push.idle()
    expect(h.push.sent.map((x) => (x.payload.notification as { data: { uid: string } }).data.uid)).toEqual([h.admin.userId])
    h.push.sent = []
    await h.req({ method: "POST", url: `/api/v1/events/${EK}/messages`, as: sam, body: { id: id(), channelId: `event:${EK}`, kind: "message", body: "@kim check 254" } })
    await h.s.push.idle()
    const uids = h.push.sent.map((x) => (x.payload.notification as { data: { uid: string } }).data.uid).sort()
    expect(uids).toEqual([h.admin.userId, kim.userId].sort())
  })

  it("'match coming up' needs a Nexus estimate fresher than 5 minutes and fires once per user and match", async () => {
    await track()
    await h.req({ method: "PUT", url: "/api/v1/team-settings", as: h.admin, body: { baseRev: 1, record: { teamNumber: 3006 } } })
    await subscribe(sam)
    h.push.sent = []
    // qm2 starts in 8 min, inside the default 10-minute lead
    expect(await h.s.matchScheduler.tick()).toBe(1)
    const n = h.push.sent[0]?.payload.notification as Record<string, any>
    expect(n.data.url).toBe(`/scout/strategy/${EK}_qm2`)
    expect(h.push.sent[0]?.opts).toMatchObject({ TTL: 600, urgency: "high", topic: `m${EK}_qm2` })
    expect(await h.s.matchScheduler.tick()).toBe(0)
    // a stale Nexus feed sends nothing, even for a match inside the lead time
    h.clock.advance(6 * 60_000)
    expect(await h.s.matchScheduler.tick()).toBe(0)
  })

  it("rotate needs the old auth secret", async () => {
    await subscribe(sam, "https://fcm.googleapis.com/fcm/send/old")
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/new", keys: { p256dh: p256, auth } }
    const bad = await h.req({ method: "POST", url: "/api/v1/push/subscriptions/rotate", body: { oldEndpoint: "https://fcm.googleapis.com/fcm/send/old", oldAuth: "wrong", subscription: sub }, key: null })
    expect(bad.body.code).toBe("unknown_subscription")
    const ok = await h.req({ method: "POST", url: "/api/v1/push/subscriptions/rotate", body: { oldEndpoint: "https://fcm.googleapis.com/fcm/send/old", oldAuth: auth, subscription: sub }, key: null })
    expect(ok.status).toBe(204)
    expect(h.s.db.get<{ endpoint: string }>("SELECT endpoint FROM push_subscriptions")?.endpoint).toBe(sub.endpoint)
  })
})
