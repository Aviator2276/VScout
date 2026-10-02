import { describe, expect, it } from "vitest"
import { INITIAL, transition } from "../connection-machine"
import type {
  MachineEvent,
  MachineState,
  MqttState,
} from "../connection-machine"
import { MAX_BACKOFF_MS, backoff } from "../reconnect-policy"
import { desiredSubscriptions, diffSubscriptions } from "../subscriptions"
import { parseTopic, topics } from "../topics"
import { laneFor } from "../router"

describe("parseTopic", () => {
  it.each([
    ["vscout/sys/status", { kind: "sysStatus" }],
    [
      "vscout/global/data/team",
      { kind: "data", scope: "global", entity: "team" },
    ],
    [
      "vscout/event/2026casj/data/match",
      { kind: "data", scope: "event", eventKey: "2026casj", entity: "match" },
    ],
    [
      "vscout/event/2026casj/chat/message",
      { kind: "data", scope: "chat", eventKey: "2026casj", entity: "message" },
    ],
    [
      "vscout/event/2026casj/control",
      { kind: "control", eventKey: "2026casj" },
    ],
    [
      "vscout/event/2026casj/presence/u1/d1",
      { kind: "presence", eventKey: "2026casj", userId: "u1", deviceId: "d1" },
    ],
    [
      "vscout/event/2026casj/typing/event:2026casj/u1",
      {
        kind: "typing",
        eventKey: "2026casj",
        channelId: "event:2026casj",
        userId: "u1",
      },
    ],
    [
      "vscout/event/2026casj/admin/alerts",
      { kind: "adminAlert", eventKey: "2026casj" },
    ],
    ["vscout/user/u1/inbox", { kind: "inbox", userId: "u1" }],
    [
      "vscout/user/u1/data/message",
      { kind: "data", scope: "user", userId: "u1", entity: "message" },
    ],
    [
      "vscout/rpc/res/u1/d1",
      { kind: "rpcResponse", userId: "u1", deviceId: "d1" },
    ],
  ])("%s", (topic, route) => {
    expect(parseTopic(topic)).toEqual(route)
  })

  it.each([
    "other/sys/status",
    "vscout/sys/status/extra",
    "vscout/event/NOTAKEY/data/match",
    "vscout/event/2026casj/data",
    "vscout/event/2026casj/secret/x",
    "vscout/event/2026casj/data/+",
    "vscout/rpc/req/u1/d1",
    "vscout//data/x",
  ])("rejects %s", (topic) => {
    expect(parseTopic(topic)).toBeNull()
  })

  it("builds the topics it parses", () => {
    expect(parseTopic(topics.presence("2026casj", "u", "d"))?.kind).toBe(
      "presence"
    )
    expect(parseTopic(topics.rpcResponse("u", "d"))?.kind).toBe("rpcResponse")
  })
})

describe("desiredSubscriptions (mqtt.md §4.1)", () => {
  const who = (role: "admin" | "scouter" | "guest") => ({
    role,
    userId: "u",
    deviceId: "d",
  })
  it("puts the RPC response topic first and needs no event for the base set", () => {
    expect(desiredSubscriptions(who("scouter"), null)).toEqual([
      "vscout/rpc/res/u/d",
      "vscout/sys/status",
      "vscout/global/data/#",
      "vscout/user/u/#",
    ])
  })
  it("never gives guests chat, presence or typing (ADR-066)", () => {
    const subs = desiredSubscriptions(who("guest"), "2026casj", {
      typingChannel: "event:2026casj",
    })
    expect(subs.some((s) => /chat|presence|typing|admin/.test(s))).toBe(false)
    expect(subs).toContain("vscout/event/2026casj/data/#")
  })
  it("adds admin alerts for admins and typing on demand", () => {
    expect(desiredSubscriptions(who("admin"), "2026casj")).toContain(
      "vscout/event/2026casj/admin/alerts"
    )
    expect(desiredSubscriptions(who("scouter"), "2026casj")).not.toContain(
      "vscout/event/2026casj/admin/alerts"
    )
    expect(
      desiredSubscriptions(who("scouter"), "2026casj", { typingChannel: "c1" })
    ).toContain("vscout/event/2026casj/typing/c1/+")
  })
  it("diffs against what's subscribed", () => {
    expect(diffSubscriptions(new Set(["a", "b"]), ["b", "c"])).toEqual({
      add: ["c"],
      remove: ["a"],
    })
  })
})

describe("backoff", () => {
  it("is full jitter up to 30 s", () => {
    expect(backoff(0, () => 0.999)).toBe(499)
    expect(backoff(3, () => 0.5)).toBe(2000)
    expect(backoff(20, () => 0.999)).toBeLessThan(MAX_BACKOFF_MS)
    expect(backoff(5, () => 0)).toBe(0)
  })
})

describe("connection machine (state × event)", () => {
  const at = (
    state: MqttState,
    patch: Partial<MachineState> = {}
  ): MachineState => ({ ...INITIAL, state, ...patch })
  const run = (s: MachineState, e: MachineEvent) => transition(s, e, () => 0.5)
  const types = (r: ReturnType<typeof run>) => r.effects.map((x) => x.type)

  it.each<[MqttState, MachineEvent, MqttState, Array<string>]>([
    ["idle", { type: "START", leader: true }, "connecting", ["connect"]],
    ["idle", { type: "START", leader: false }, "follower", []],
    [
      "connecting",
      { type: "CONNACK_OK" },
      "connected",
      ["resubscribeAll", "publishPresence", "requestSync"],
    ],
    [
      "connected",
      { type: "CLOSED" },
      "reconnecting",
      ["rejectRpc", "scheduleRetry"],
    ],
    [
      "connected",
      { type: "DISCONNECT", code: 141 },
      "reconnecting",
      ["rejectRpc", "scheduleRetry"],
    ],
    [
      "connected",
      { type: "DISCONNECT", code: 142 },
      "displaced",
      ["rejectRpc"],
    ],
    [
      "connected",
      { type: "DISCONNECT", code: 135 },
      "connecting",
      ["rejectRpc", "refreshToken"],
    ],
    [
      "connecting",
      { type: "CONNACK_FAILED", code: 134 },
      "connecting",
      ["rejectRpc", "refreshToken"],
    ],
    [
      "connecting",
      { type: "CONNACK_FAILED", code: 128 },
      "reconnecting",
      ["rejectRpc", "scheduleRetry"],
    ],
    ["reconnecting", { type: "RETRY_TIMER" }, "connecting", ["connect"]],
    ["connected", { type: "OFFLINE" }, "offline", ["cancelRetry", "rejectRpc"]],
    ["offline", { type: "ONLINE" }, "connecting", ["cancelRetry", "connect"]],
    [
      "reconnecting",
      { type: "ONLINE" },
      "connecting",
      ["cancelRetry", "connect"],
    ],
    [
      "connected",
      { type: "VISIBLE", hiddenMs: 6000 },
      "connecting",
      ["rejectRpc", "hardReconnect"],
    ],
    ["connected", { type: "VISIBLE", hiddenMs: 1000 }, "connected", []],
    [
      "displaced",
      { type: "VISIBLE", hiddenMs: 0 },
      "connecting",
      ["cancelRetry", "connect"],
    ],
    ["connected", { type: "HIDDEN" }, "connected", ["publishPresence"]],
    ["connected", { type: "TOKEN_REFRESHED" }, "connected", ["updatePassword"]],
    [
      "connected",
      { type: "LEADER_LOST" },
      "follower",
      ["cancelRetry", "rejectRpc", "end"],
    ],
    ["follower", { type: "LEADER_GAINED" }, "connecting", ["connect"]],
    [
      "connected",
      { type: "STOP" },
      "idle",
      ["cancelRetry", "rejectRpc", "end"],
    ],
    ["idle", { type: "CLOSED" }, "idle", []],
    [
      "connected",
      { type: "RECONNECT" },
      "connecting",
      ["rejectRpc", "hardReconnect"],
    ],
    ["reconnecting", { type: "RECONNECT" }, "reconnecting", []],
    ["unauthorized", { type: "DISCONNECT", code: 141 }, "unauthorized", []],
    ["connected", { type: "RETRY_TIMER" }, "connected", []],
  ])("%s + %j → %s", (from, event, to, effects) => {
    const r = run(at(from), event)
    expect(r.next.state).toBe(to)
    expect(types(r)).toEqual(effects)
  })

  it("refreshes once per auth failure streak, then gives up", () => {
    const first = run(at("connecting"), { type: "CONNACK_FAILED", code: 135 })
    expect(first.next.authRetried).toBe(true)
    expect(types(run(first.next, { type: "REFRESH_OK" }))).toEqual(["connect"])
    const second = run(first.next, { type: "CONNACK_FAILED", code: 135 })
    expect(second.next.state).toBe("unauthorized")
    expect(run(first.next, { type: "REFRESH_FAILED" }).next.state).toBe(
      "unauthorized"
    )
    // a successful connect resets the streak
    expect(run(first.next, { type: "CONNACK_OK" }).next.authRetried).toBe(false)
  })

  it("counts reconnect attempts and resets them on connect", () => {
    const a = run(at("connected"), { type: "CLOSED" })
    const b = run(run(a.next, { type: "RETRY_TIMER" }).next, { type: "CLOSED" })
    expect(b.next.attempt).toBe(2)
    expect(b.effects.find((e) => e.type === "scheduleRetry")).toEqual({
      type: "scheduleRetry",
      delayMs: 1000,
    })
    expect(
      run(run(b.next, { type: "RETRY_TIMER" }).next, { type: "CONNACK_OK" })
        .next.attempt
    ).toBe(0)
  })
})

describe("priority lanes", () => {
  const route = (scope: "event" | "chat" | "user", entity: string) => ({
    kind: "data" as const,
    scope,
    entity,
  })
  it.each([
    [route("event", "message"), { data: { kind: "announcement" } }, "urgent"],
    [route("user", "message"), { data: { kind: "message" } }, "urgent"],
    [route("chat", "message"), { data: { kind: "message" } }, "normal"],
    [route("event", "allianceBoard"), {}, "normal"],
    [route("event", "scoutEntry"), {}, "bulk"],
    [route("event", "eventTeam"), {}, "bulk"],
  ] as const)("%j → %s", (r, env, lane) => {
    expect(laneFor(r, env)).toBe(lane)
  })
})
