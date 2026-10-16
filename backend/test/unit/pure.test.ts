import { describe, expect, it } from "vitest"
import { aclFor, isAllowed, topicMatches } from "../../src/auth/acl.js"
import { lostTargets, targetsFor, topicFor } from "../../src/domain/routing.js"
import { mapNexusStatus, matchKeyForLabel, parsePits } from "../../src/imports/nexus.js"
import { parseNexusMap, renderSvg } from "../../src/imports/pit-map.js"
import { mapEvent, mapMatch, mapRankings } from "../../src/imports/tba.js"
import { compareSemver } from "../../src/lib/semver.js"
import { uuidv7 } from "../../src/lib/ids.js"
import { generatePassphrase, hashPassword, verifyPassword } from "../../src/lib/passwords.js"
import { buildPayload, clean, pushTopic } from "../../src/push/payload.js"
import { checkEndpoint } from "../../src/push/push-service.js"

describe("MQTT ACL (REQUIREMENTS §9.3)", () => {
  const scouter = aclFor("u1", "scouter")
  const guest = aclFor("g1", "guest", "2026casj")
  const admin = aclFor("a1", "admin")

  it.each([
    ["scouter subscribes to event data", scouter, "subscribe", "vscout/event/2026casj/data/#", true],
    ["scouter subscribes to chat", scouter, "subscribe", "vscout/event/2026casj/chat/#", true],
    ["scouter publishes to a data topic", scouter, "publish", "vscout/event/2026casj/data/message", false],
    ["scouter publishes own presence", scouter, "publish", "vscout/event/2026casj/presence/u1/dev", true],
    ["scouter publishes someone else's presence", scouter, "publish", "vscout/event/2026casj/presence/u2/dev", false],
    ["scouter reads admin alerts", scouter, "subscribe", "vscout/event/2026casj/admin/#", false],
    ["scouter reads another user's topic", scouter, "subscribe", "vscout/user/u2/#", false],
    ["scouter sends RPC as itself", scouter, "publish", "vscout/rpc/req/u1/dev", true],
    ["scouter sends RPC as another user", scouter, "publish", "vscout/rpc/req/u2/dev", false],
    ["scouter subscribes to everything", scouter, "subscribe", "#", false],
    ["scouter subscribes to vscout/event/+/#", scouter, "subscribe", "vscout/event/+/#", false],
    ["guest subscribes to chat", guest, "subscribe", "vscout/event/2026casj/chat/#", false],
    ["guest subscribes to presence", guest, "subscribe", "vscout/event/2026casj/presence/#", false],
    ["guest subscribes to its event data", guest, "subscribe", "vscout/event/2026casj/data/#", true],
    ["guest subscribes to another event", guest, "subscribe", "vscout/event/2026other/data/#", false],
    ["guest publishes typing", guest, "publish", "vscout/event/2026casj/typing/event:2026casj/g1", false],
    ["admin reads alerts", admin, "subscribe", "vscout/event/2026casj/admin/alerts", true],
  ] as const)("%s → %s", (_n, rules, action, topic, allowed) => {
    expect(isAllowed([...rules], action, topic)).toBe(allowed)
  })

  it("matches topic filters", () => {
    expect(topicMatches("vscout/event/+/data/#", "vscout/event/x/data/match")).toBe(true)
    expect(topicMatches("vscout/event/+/data/#", "vscout/event/x/chat/message")).toBe(false)
    expect(topicMatches("a/+", "a/b/c")).toBe(false)
  })

  it("lets the service account use shared subscriptions", () => {
    expect(isAllowed(aclFor("svc", "service"), "subscribe", "$share/api/vscout/rpc/req/+/+")).toBe(true)
  })
})

describe("routing", () => {
  const none = () => undefined
  it("routes records to their audience and topic", () => {
    const priv = targetsFor("comment", { id: "c", eventKey: "2026casj", authorId: "u1", visibility: "private" }, none)
    expect(priv).toEqual([{ scope: "user:u1", audience: "all" }])
    expect(topicFor(priv[0]!, "comment")).toBe("vscout/user/u1/data/comment")
    const chat = targetsFor("message", { id: "m", eventKey: "2026casj", channelId: "event:2026casj", kind: "message" }, none)
    expect(topicFor(chat[0]!, "message")).toBe("vscout/event/2026casj/chat/message")
    const dm = targetsFor("message", { id: "m", eventKey: "2026casj", channelId: "dm:a:b", kind: "message" }, none)
    expect(dm.map((t) => t.scope)).toEqual(["user:a", "user:b"])
    const reaction = targetsFor("reaction", { id: "r", eventKey: "2026casj", targetId: "m" }, () => ({ channelId: "dm:a:b", kind: "message" }))
    expect(reaction.map((t) => t.scope)).toEqual(["user:a", "user:b"])
  })

  it("excludes the author from the delete when a comment goes private", () => {
    const lost = lostTargets([{ scope: "event:x", audience: "all" }], [{ scope: "user:u1", audience: "all" }])
    expect(lost).toEqual([{ scope: "event:x", audience: "all", excludeUser: "u1" }])
  })
})

describe("TBA mapping", () => {
  it("keeps unknown event types raw instead of defaulting", () => {
    const e = mapEvent({ key: "2026x", name: "X", year: 2026, event_type: 42, event_type_string: "Brand New", start_date: "2026-01-01", end_date: "2026-01-02" }, { "2026": "2026-rebuilt" }, "2026-rebuilt")
    expect(e).not.toHaveProperty("eventType")
    expect(e).toMatchObject({ tbaEventType: 42, eventTypeString: "Brand New", timezone: "UTC", gameId: "2026-rebuilt" })
  })

  it("maps scores of -1 to null and skips unknown comp levels", () => {
    const m = mapMatch({
      key: "2026x_qm1",
      comp_level: "qm",
      set_number: 1,
      match_number: 1,
      event_key: "2026x",
      alliances: { red: { team_keys: ["frc1", "frc2", "frc3"], score: -1 }, blue: { team_keys: ["frc4", "frc5", "frc6"], score: -1 } },
    })
    expect(m).toMatchObject({ played: false, alliances: { red: { score: null, teamNumbers: [1, 2, 3] } } })
    expect(mapMatch({ key: "2026x_pm1", comp_level: "pm", set_number: 1, match_number: 1, event_key: "2026x", alliances: { red: { team_keys: [] }, blue: { team_keys: [] } } })).toBeNull()
  })

  it("names ranking sort orders", () => {
    const r = mapRankings({ rankings: [{ team_key: "frc254", rank: 1, sort_orders: [3.2, 100] }], sort_order_info: [{ name: "Ranking Score", precision: 2 }, { name: "Avg Match", precision: 2 }] })
    expect(r.get(254)).toMatchObject({ rank: 1, rankingPoints: 3.2, ranking: { sortOrders: { "Ranking Score": 3.2, "Avg Match": 100 } } })
  })
})

describe("Nexus mapping", () => {
  it("maps match labels to TBA keys", () => {
    expect(matchKeyForLabel("2026x", "Qualification 12")).toBe("2026x_qm12")
    expect(matchKeyForLabel("2026x", "Playoff 4")).toBe("2026x_sf4m1")
    expect(matchKeyForLabel("2026x", "Final 2")).toBe("2026x_f1m2")
    expect(matchKeyForLabel("2026x", "Practice 3")).toBeNull()
  })
  it("maps known statuses and flags unknown ones", () => {
    expect(mapNexusStatus("On deck")).toBe("queuing")
    expect(mapNexusStatus("On field")).toBe("onField")
    expect(mapNexusStatus("Something new")).toBeUndefined()
  })
  it("reads pits as a map or a list", () => {
    expect([...parsePits({ "254": "A1", frc1678: "B2", junk: 5 })]).toEqual([[254, "A1"], [1678, "B2"]])
    expect([...parsePits([{ team: 971, pit: "C3" }])]).toEqual([[971, "C3"]])
  })
  it("draws a map and escapes labels", () => {
    const map = parseNexusMap({ pits: [{ address: "A1", x: -50, y: 0, width: 40, height: 30 }], labels: [{ text: "<b>", position: { x: 0, y: 0 } }] })
    expect(map?.pits.get("A1")).toMatchObject({ x: 20, w: 40 })
    const svg = renderSvg(map!, new Map([["A1", 254]]))
    expect(svg).toContain(">254<")
    expect(svg).not.toContain("<b>")
    expect(parseNexusMap({ pits: {} })).toBeNull()
  })
})

describe("push payload", () => {
  it("strips control characters, caps lengths and stays under 3,000 bytes", () => {
    expect(clean("a\u0000b‮c  d", 80)).toBe("a b c d")
    const p = buildPayload({ kind: "message", title: "T".repeat(200), body: "😀".repeat(2000), url: "/messages/x", tag: "message:x", eventKey: null, entity: null }, "u1", "https://app.test/", 0)
    const n = p.notification as { title: string; navigate: string }
    expect(n.title.length).toBeLessThanOrEqual(80)
    expect(n.navigate).toBe("https://app.test/messages/x")
    expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThanOrEqual(3000)
  })
  it("makes Topic headers safe", () => {
    expect(pushTopic("m2026casj_qm12")).toBe("m2026casj_qm12")
    expect(pushTopic("message:event:2026casj")).toMatch(/^[A-Za-z0-9_-]{1,32}$/)
    expect(pushTopic("x".repeat(50))).toHaveLength(32)
  })
  it("allows only known push services", () => {
    expect(() => checkEndpoint("https://web.push.apple.com/abc")).not.toThrow()
    expect(() => checkEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).not.toThrow()
    expect(() => checkEndpoint("https://fcm.googleapis.com:8443/x")).toThrow()
    expect(() => checkEndpoint("https://localhost/x")).toThrow()
  })
})

describe("small helpers", () => {
  it("compares semver with prereleases", () => {
    expect(compareSemver("2.0.0-alpha.0", "2.0.0")).toBe(-1)
    expect(compareSemver("2.0.0-alpha.10", "2.0.0-alpha.9")).toBe(1)
    expect(compareSemver("2.1.0", "2.0.9")).toBe(1)
    expect(compareSemver("1.9.9", "2.0.0-alpha.0")).toBe(-1)
    expect(compareSemver("2.0.0", "2.0.0")).toBe(0)
  })
  it("makes sortable UUIDv7s", () => {
    const a = uuidv7(1000)
    const b = uuidv7(2000)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a < b).toBe(true)
  })
  it("hashes passwords and generates passphrases", async () => {
    const h = await hashPassword("correct horse 42")
    expect(await verifyPassword("correct horse 42", h)).toBe(true)
    expect(await verifyPassword("wrong", h)).toBe(false)
    expect(generatePassphrase()).toMatch(/^[a-z]+ [a-z]+ [a-z]+ \d\d$/)
  })
})
