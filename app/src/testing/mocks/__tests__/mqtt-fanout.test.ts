import { describe, expect, it } from "vitest"
import { controlMessage } from "@/lib/contracts/mqtt"
import { parseTopic } from "@/lib/mqtt/topics"
import type { EntityName } from "@/lib/contracts/entities"
import type { LogEntry, MockRecord } from "../mock-backend"
import { BULK_THRESHOLD, fanoutTopics, planFanout } from "../mqtt-fanout"

const EK = "2026casj"
const A = "01900000-0000-7000-8000-00000000000a"
const B = "01900000-0000-7000-8000-00000000000b"
const NOW = "2026-03-20T16:00:00.000Z"

function entry(
  entity: EntityName,
  data: Record<string, unknown> | null,
  scope = `event:${EK}`,
  id = "r1"
): LogEntry {
  return {
    scope,
    entity,
    envelope: {
      v: 1,
      entity,
      op: data ? "upsert" : "delete",
      id,
      rev: 2,
      eventKey: scope.startsWith("event:") ? EK : null,
      ts: NOW,
      ...(data ? { data } : {}),
    },
  }
}

const store = new Map<string, MockRecord>()
const lookup = (entity: string, id: string) => store.get(`${entity}:${id}`)
const none = () => undefined

describe("fanoutTopics (mqtt-contract §4, §4.2)", () => {
  it("Given an event record, it goes to the event data topic", () => {
    expect(fanoutTopics(entry("scoutEntry", { eventKey: EK }), none)).toEqual([
      `vscout/event/${EK}/data/scoutEntry`,
    ])
  })

  it("Given a global record, it goes to the global data topic", () => {
    expect(
      fanoutTopics(entry("teamSettings", { id: "t" }, "global"), none)
    ).toEqual(["vscout/global/data/teamSettings"])
  })

  it("Given an announcement, everyone gets it (data); a chat message only on chat (guests can't read)", () => {
    const channelId = `event:${EK}`
    expect(
      fanoutTopics(entry("message", { channelId, kind: "announcement" }), none)
    ).toEqual([`vscout/event/${EK}/data/message`])
    expect(
      fanoutTopics(entry("message", { channelId, kind: "message" }), none)
    ).toEqual([`vscout/event/${EK}/chat/message`])
  })

  it("Given a DM, it goes to both participants' user topics and never to the event", () => {
    const topics = fanoutTopics(
      entry("message", { channelId: `dm:${A}:${B}`, kind: "message" }),
      none
    )
    expect(topics).toEqual([
      `vscout/user/${A}/data/message`,
      `vscout/user/${B}/data/message`,
    ])
  })

  it("Given reactions, they follow their target: announcement → data, chat → chat, DM → both users", () => {
    expect(
      fanoutTopics(
        entry("reaction", { targetType: "announcement", targetId: "m0" }),
        none
      )
    ).toEqual([`vscout/event/${EK}/data/reaction`])

    store.set("message:m1", { id: "m1", rev: 1, channelId: `event:${EK}` })
    store.set("message:m2", { id: "m2", rev: 1, channelId: `dm:${A}:${B}` })
    expect(
      fanoutTopics(
        entry("reaction", { targetType: "message", targetId: "m1" }),
        lookup
      )
    ).toEqual([`vscout/event/${EK}/chat/reaction`])
    expect(
      fanoutTopics(
        entry("reaction", { targetType: "message", targetId: "m2" }),
        lookup
      )
    ).toEqual([
      `vscout/user/${A}/data/reaction`,
      `vscout/user/${B}/data/reaction`,
    ])
  })

  it("Given a private comment, only its author's user topic; a team comment goes to the event", () => {
    expect(
      fanoutTopics(
        entry("comment", { visibility: "private", authorId: A }),
        none
      )
    ).toEqual([`vscout/user/${A}/data/comment`])
    expect(
      fanoutTopics(entry("comment", { visibility: "team", authorId: A }), none)
    ).toEqual([`vscout/event/${EK}/data/comment`])
  })

  it("Given userSettings, only that user's topic", () => {
    expect(
      fanoutTopics(entry("userSettings", { userId: B }, "user", B), none)
    ).toEqual([`vscout/user/${B}/data/userSettings`])
  })

  it("Given a delete of a DM, it uses the stored record to find the participants", () => {
    store.set("message:m3", { id: "m3", rev: 3, channelId: `dm:${A}:${B}` })
    expect(
      fanoutTopics(entry("message", null, `event:${EK}`, "m3"), lookup)
    ).toEqual([
      `vscout/user/${A}/data/message`,
      `vscout/user/${B}/data/message`,
    ])
  })

  it("Given a private-capable record whose audience is unknown, nothing is published (the next pull has it)", () => {
    expect(fanoutTopics(entry("message", null), none)).toEqual([])
    expect(fanoutTopics(entry("comment", null), none)).toEqual([])
    expect(
      fanoutTopics(
        entry("reaction", { targetType: "message", targetId: "gone" }),
        none
      )
    ).toEqual([])
  })

  it("Then every topic it produces is one the app's router accepts", () => {
    const topics = [
      ...fanoutTopics(entry("scoutEntry", {}), none),
      ...fanoutTopics(entry("message", { channelId: `dm:${A}:${B}` }), none),
      ...fanoutTopics(
        entry("message", { channelId: `event:${EK}`, kind: "message" }),
        none
      ),
      ...fanoutTopics(entry("team", {}, "global"), none),
    ]
    for (const t of topics) expect(parseTopic(t)?.kind).toBe("data")
  })
})

describe("planFanout (mqtt-contract §4.1, §4.3)", () => {
  it("Given one write, it publishes the envelope with the entity's QoS", () => {
    const out = planFanout(
      [
        entry("scoutEntry", {}),
        entry("reaction", { targetType: "announcement" }),
      ],
      none,
      NOW
    )
    expect(out.map((m) => [m.topic, m.qos])).toEqual([
      [`vscout/event/${EK}/data/scoutEntry`, 1],
      [`vscout/event/${EK}/data/reaction`, 0],
    ])
  })

  it("Given more than 50 changes of one event at once, it publishes one resync control instead", () => {
    const burst = Array.from({ length: BULK_THRESHOLD + 1 }, (_, i) =>
      entry(i % 2 ? "match" : "eventTeam", {}, `event:${EK}`, `r${i}`)
    )
    const out = planFanout([...burst, entry("team", {}, "global")], none, NOW)
    expect(out.map((m) => m.topic)).toEqual([
      "vscout/global/data/team",
      `vscout/event/${EK}/control`,
    ])
    const [, resync] = out
    const control = controlMessage.parse(resync?.payload)
    expect(control).toMatchObject({ cmd: "resync" })
    expect(control.cmd === "resync" && control.entities.sort()).toEqual([
      "eventTeam",
      "match",
    ])
    expect(parseTopic(resync?.topic ?? "")).toEqual({
      kind: "control",
      eventKey: EK,
    })
  })
})
