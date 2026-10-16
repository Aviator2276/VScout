import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { EVENT, harness, id, pullAll } from "../helpers.js"
import type { Harness, Session } from "../helpers.js"

let h: Harness
let sam: Session
let kim: Session
beforeEach(async () => {
  h = await harness()
  sam = await h.user("sam")
  kim = await h.user("kim")
})
afterEach(async () => h.close())

const post = (as: Session, collection: string, body: unknown, key?: string) =>
  h.req({ method: "POST", url: `/api/v1/events/${EVENT}/${collection}`, as, body, ...(key ? { key } : {}) })
const dm = (a: string, b: string) => `dm:${[a, b].sort().join(":")}`
const everything = async (as: Session) => {
  const ev = await pullAll(h, as, `event:${EVENT}`, ["comment", "message", "reaction"])
  const user = await pullAll(h, as, "user", ["comment", "message", "reaction"])
  return [...ev.changes, ...user.changes]
}

async function enableGuests(code = "K7M2QX") {
  const cur = h.s.store.live("eventSettings", EVENT)
  const r = await h.req({ method: "PUT", url: `/api/v1/events/${EVENT}/settings`, as: h.admin, body: { baseRev: cur?.rev, record: { guestAccess: { enabled: true, code } } } })
  expect(r.status).toBe(200)
  return r.body
}

describe("private notes and DMs never leak", () => {
  it("a private comment reaches only its author (sync and MQTT)", async () => {
    const c = await post(sam, "comments", { id: id(), teamNumber: 254, body: "secret", visibility: "private" })
    expect(c.status).toBe(201)
    expect((await everything(sam)).map((e) => e.id)).toContain(c.body.id)
    expect((await everything(kim)).map((e) => e.id)).not.toContain(c.body.id)
    expect((await everything(h.admin)).map((e) => e.id)).not.toContain(c.body.id)
    const topics = h.link.messages.filter((m) => m.payload.id === c.body.id).map((m) => m.topic)
    expect(topics).toEqual([`vscout/user/${sam.userId}/data/comment`])
  })

  it("switching a comment to private sends a delete to everyone who lost it, never to the author", async () => {
    const kimBoot = await pullAll(h, kim, `event:${EVENT}`, ["comment"])
    const samBoot = await pullAll(h, sam, `event:${EVENT}`, ["comment"])
    const c = await post(sam, "comments", { id: id(), teamNumber: 254, body: "x" })
    h.link.clear()
    const u = await h.req({ method: "PUT", url: `/api/v1/comments/${c.body.id}`, as: sam, body: { baseRev: 1, record: { ...c.body, visibility: "private" } } })
    expect(u.status).toBe(200)
    const kimDelta = await pullAll(h, kim, `event:${EVENT}`, ["comment"], kimBoot.cursors)
    expect(kimDelta.changes.map((e) => `${e.op}:${e.rev}`)).toEqual(["upsert:1", "delete:2"])
    const samDelta = await pullAll(h, sam, `event:${EVENT}`, ["comment"], samBoot.cursors)
    expect(samDelta.changes.map((e) => `${e.op}:${e.rev}`)).toEqual(["upsert:1"])
    const samUser = await pullAll(h, sam, "user", ["comment"])
    expect(samUser.changes.map((e) => `${e.op}:${e.rev}`)).toEqual(["upsert:2"])
    // fresh devices: kim's bootstrap has nothing, sam's has it once
    expect((await pullAll(h, kim, `event:${EVENT}`, ["comment"])).changes).toEqual([])
    // MQTT: the shared topic can't exclude the author, so it gets a resync instead of a delete
    expect(h.link.on(`vscout/event/${EVENT}/data/comment`)).toEqual([])
    expect(h.link.on(`vscout/event/${EVENT}/control`)[0]?.payload).toMatchObject({ cmd: "resync", entities: ["comment"] })
    expect(h.link.on(`vscout/user/${sam.userId}/data/comment`)).toHaveLength(1)

    // and back to team: everyone sees it again, the author's private copy is retired
    const back = await h.req({ method: "PUT", url: `/api/v1/comments/${c.body.id}`, as: sam, body: { baseRev: 2, record: { ...u.body, visibility: "team" } } })
    expect(back.status).toBe(200)
    expect((await pullAll(h, kim, `event:${EVENT}`, ["comment"])).changes.map((e) => e.rev)).toEqual([3])
    expect((await pullAll(h, sam, "user", ["comment"])).changes).toEqual([])
  })

  it("a DM reaches only its two participants — not even admins", async () => {
    const m = await post(sam, "messages", { id: id(), channelId: dm(sam.userId, kim.userId), kind: "message", body: "psst" })
    expect(m.status).toBe(201)
    expect(m.body.eventKey).toBe(EVENT)
    expect((await everything(kim)).map((e) => e.id)).toContain(m.body.id)
    expect((await everything(h.admin)).map((e) => e.id)).not.toContain(m.body.id)
    const topics = h.link.messages.filter((x) => x.payload.id === m.body.id).map((x) => x.topic).sort()
    expect(topics).toEqual([`vscout/user/${kim.userId}/data/message`, `vscout/user/${sam.userId}/data/message`].sort())
    // a non-participant can't post into it, read its history, or learn about it from a 409
    const intrude = await post(h.admin, "messages", { id: id(), channelId: dm(sam.userId, kim.userId), kind: "message", body: "hi" })
    expect(intrude.status).toBe(403)
    const hist = await h.req({ method: "GET", url: `/api/v1/channels/${encodeURIComponent(dm(sam.userId, kim.userId))}/messages`, as: h.admin })
    expect(hist.status).toBe(403)
    const clash = await post(h.admin, "messages", { id: m.body.id, channelId: `event:${EVENT}`, kind: "message", body: "x" })
    expect(clash.body).toMatchObject({ code: "already_exists", current: null })
    const own = await h.req({ method: "GET", url: `/api/v1/channels/${encodeURIComponent(dm(sam.userId, kim.userId))}/messages`, as: kim })
    expect(own.body.items.map((x: { id: string }) => x.id)).toEqual([m.body.id])
  })

  it("DM reactions follow the DM; admins can't moderate them", async () => {
    const m = await post(sam, "messages", { id: id(), channelId: dm(sam.userId, kim.userId), kind: "message", body: "psst" })
    const r = await post(kim, "reactions", { id: id(), targetType: "message", targetId: m.body.id, emoji: "👍" })
    expect(r.status).toBe(201)
    expect((await everything(sam)).map((e) => e.id)).toContain(r.body.id)
    expect((await everything(h.admin)).map((e) => e.id)).not.toContain(r.body.id)
    expect(h.link.messages.filter((x) => x.payload.id === r.body.id).map((x) => x.topic).every((t) => t.startsWith("vscout/user/"))).toBe(true)
    const del = await h.req({ method: "DELETE", url: `/api/v1/reactions/${r.body.id}?baseRev=1`, as: h.admin })
    expect(del.status).toBe(404)
  })
})

describe("guests", () => {
  it("logs in with the event's code and reads its event, but never chat", async () => {
    await enableGuests()
    const chat = await post(sam, "messages", { id: id(), channelId: `event:${EVENT}`, kind: "message", body: "chat" })
    const ann = await post(h.admin, "messages", { id: id(), channelId: `event:${EVENT}`, kind: "announcement", body: "news" })
    const chatReaction = await post(kim, "reactions", { id: id(), targetType: "message", targetId: chat.body.id, emoji: "😂" })
    const g = await h.guest("k7m2qx")
    expect(g.role).toBe("guest")
    const seen = (await everything(g)).map((e) => e.id)
    expect(seen).toContain(ann.body.id)
    expect(seen).not.toContain(chat.body.id)
    expect(seen).not.toContain(chatReaction.body.id)
    expect(h.link.messages.filter((m) => m.payload.id === chat.body.id).map((m) => m.topic)).toEqual([`vscout/event/${EVENT}/chat/message`])
    expect(h.link.messages.filter((m) => m.payload.id === ann.body.id).map((m) => m.topic)).toEqual([`vscout/event/${EVENT}/data/message`])
    expect((await h.req({ method: "GET", url: `/api/v1/channels/event:${EVENT}/messages`, as: g })).status).toBe(403)
  })

  it("can react to announcements and nothing else", async () => {
    await enableGuests()
    const chat = await post(sam, "messages", { id: id(), channelId: `event:${EVENT}`, kind: "message", body: "chat" })
    const ann = await post(h.admin, "messages", { id: id(), channelId: `event:${EVENT}`, kind: "announcement", body: "news" })
    const g = await h.guest("K7M2QX")
    const ok = await post(g, "reactions", { id: id(), targetType: "announcement", targetId: ann.body.id, emoji: "🎉" })
    expect(ok.status).toBe(201)
    expect((await post(g, "reactions", { id: id(), targetType: "message", targetId: chat.body.id, emoji: "🎉" })).body.code).toBe("role_required")
    expect((await post(g, "comments", { id: id(), teamNumber: 254, body: "x" })).body.code).toBe("role_required")
    expect((await h.req({ method: "PATCH", url: "/api/v1/me/settings", as: g, body: { baseRev: 0, patch: {} } })).body.code).toBe("role_required")
    const del = await h.req({ method: "DELETE", url: `/api/v1/reactions/${ok.body.id}?baseRev=1`, as: g })
    expect(del.status).toBe(200)
    // a guest reads only its own event
    const other = await h.req({ method: "GET", url: "/api/v1/sync/changes?scope=event:2026other&entities=match", as: g })
    expect(other.body.code).toBe("guest_access_disabled")
  })

  it("wrong codes are 401 invalid_guest_code and rate-limited", async () => {
    await enableGuests()
    for (let i = 0; i < 5; i++) {
      const r = await h.req({ method: "POST", url: "/api/v1/auth/guest", body: { code: "ZZZZZZ", deviceId: "g1", deviceName: "" } })
      expect(r.body.code).toBe("invalid_guest_code")
    }
    const r = await h.req({ method: "POST", url: "/api/v1/auth/guest", body: { code: "K7M2QX", deviceId: "g1", deviceName: "" } })
    expect(r.status).toBe(429)
  })

  it("turning guest access off or rotating the code signs guests out", async () => {
    const s1 = await enableGuests()
    expect(s1.guestAccess).toMatchObject({ enabled: true, code: "K7M2QX" })
    expect(s1.guestAccess.rotatedAt).toBeTruthy()
    const g = await h.guest("K7M2QX")
    const rotated = await h.req({ method: "PUT", url: `/api/v1/events/${EVENT}/settings`, as: h.admin, body: { baseRev: s1.rev, record: { guestAccess: { enabled: true, code: "ABCDEF" } } } })
    expect(rotated.status).toBe(200)
    expect(h.link.on(`vscout/user/${g.userId}/inbox`)[0]?.payload).toMatchObject({ kind: "forceLogout", reason: "guest_code_rotated" })
    expect((await h.req({ method: "POST", url: "/api/v1/auth/refresh", headers: { cookie: g.cookie }, key: null })).status).toBe(401)
    const g2 = await h.guest("ABCDEF")
    const off = await h.req({ method: "PUT", url: `/api/v1/events/${EVENT}/settings`, as: h.admin, body: { baseRev: rotated.body.rev, record: { guestAccess: { enabled: false } } } })
    expect(off.status).toBe(200)
    expect(h.link.on(`vscout/user/${g2.userId}/inbox`)[0]?.payload).toMatchObject({ kind: "forceLogout", reason: "guest_access_disabled" })
    expect((await h.req({ method: "GET", url: "/api/v1/me", as: g2 })).status).toBe(401)
    expect((await h.req({ method: "POST", url: "/api/v1/auth/guest", body: { code: "ABCDEF", deviceId: "zz", deviceName: "" } })).status).toBe(401)
  })

  it("validates the code format and refuses a code another event uses", async () => {
    const bad = await h.req({ method: "PUT", url: `/api/v1/events/${EVENT}/settings`, as: h.admin, body: { baseRev: 1, record: { guestAccess: { enabled: true, code: "OOOO00" } } } })
    expect(bad.status).toBe(422)
    await enableGuests("K7M2QX")
    h.s.importer.createManualEvent({ eventKey: "2026other", name: "Other", startDate: "2026-04-01", endDate: "2026-04-02" })
    const taken = await h.req({ method: "PUT", url: "/api/v1/events/2026other/settings", as: h.admin, body: { baseRev: 1, record: { guestAccess: { enabled: true, code: "k7m2qx" } } } })
    expect(taken.status).toBe(409)
    expect(taken.body.code).toBe("guest_code_taken")
  })
})

describe("reactions", () => {
  it("validates emoji and target type; duplicates are 409 with current", async () => {
    const ann = await post(h.admin, "messages", { id: id(), channelId: `event:${EVENT}`, kind: "announcement", body: "news" })
    const bad = await post(sam, "reactions", { id: id(), targetType: "announcement", targetId: ann.body.id, emoji: "🍕" })
    expect(bad.status).toBe(422)
    const mismatch = await post(sam, "reactions", { id: id(), targetType: "message", targetId: ann.body.id, emoji: "👎" })
    expect(mismatch.status).toBe(422)
    const ok = await post(sam, "reactions", { id: id(), targetType: "announcement", targetId: ann.body.id, emoji: "👎" })
    expect(ok.status).toBe(201)
    const dup = await post(sam, "reactions", { id: id(), targetType: "announcement", targetId: ann.body.id, emoji: "👎" })
    expect(dup.status).toBe(409)
    expect(dup.body).toMatchObject({ code: "duplicate", current: { id: ok.body.id } })
    // no updates
    expect((await h.req({ method: "PUT", url: `/api/v1/reactions/${ok.body.id}`, as: sam, body: { baseRev: 1, record: ok.body } })).status).toBe(422)
  })
})

describe("MQTT publishing", () => {
  it("one envelope per write with rev 1 and opId; a replay publishes nothing", async () => {
    const key = id()
    const body = { id: id(), channelId: `event:${EVENT}`, kind: "message", body: "hello" }
    await post(sam, "messages", body, key)
    const msgs = h.link.on(`vscout/event/${EVENT}/chat/message`)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]?.payload).toMatchObject({ v: 1, entity: "message", op: "upsert", rev: 1, opId: key })
    expect(msgs[0]?.opts.qos).toBe(1)
    await post(sam, "messages", body, key)
    expect(h.link.on(`vscout/event/${EVENT}/chat/message`)).toHaveLength(1)
  })

  it("writes still succeed with the broker down; the change log has everything", async () => {
    h.link.clear()
    h.link.connected = false
    const boot = await pullAll(h, sam, `event:${EVENT}`, ["comment"])
    for (let i = 0; i < 3; i++) expect((await post(sam, "comments", { id: id(), teamNumber: 254, body: `c${i}` })).status).toBe(201)
    expect(h.link.messages).toHaveLength(0)
    expect((await pullAll(h, kim, `event:${EVENT}`, ["comment"], boot.cursors)).changes).toHaveLength(3)
  })
})
