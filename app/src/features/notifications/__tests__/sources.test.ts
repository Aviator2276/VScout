import { describe, expect, it } from "vitest"
import { notificationSettings } from "@/lib/contracts/user-settings"
import {
  matchResultNotifications,
  matchSoonNotifications,
  messageNotifications,
  mentions,
} from "../utils/sources"
import type { SourceMatch, SourceMessage } from "../utils/sources"

const prefs = notificationSettings.parse({})
const ME = "u-me"
const names = new Map([
  ["u-sam", "Sam Chen"],
  ["u-me", "Alex Rivera"],
])
const msg = (o: Partial<SourceMessage> = {}): SourceMessage => ({
  id: "m1",
  channelId: "event:2026casj",
  kind: "message",
  priority: "normal",
  authorId: "u-sam",
  body: "Q14 queue moved to field 2",
  createdAt: 100,
  ...o,
})
const ctx = (p: Partial<typeof prefs> = {}) => ({
  me: ME,
  myName: "Alex Rivera",
  prefs: { ...prefs, ...p },
  authorName: (id: string) => names.get(id) ?? "Someone",
  eventKey: "2026casj",
})

describe("message sources (notifications-center.md N2)", () => {
  it("a chat message from someone else notifies; my own never does (criteria 1, 2)", () => {
    const out = messageNotifications(
      [msg(), msg({ id: "m2", authorId: ME })],
      ctx()
    )
    expect(out).toEqual([
      {
        key: "msg:m1",
        category: "messages",
        priority: "normal",
        title: "Sam Chen in #2026casj",
        body: "Q14 queue moved to field 2",
        href: "/messages/event:2026casj",
        group: "event:2026casj",
      },
    ])
  })

  it("mentions mode only notifies when I'm mentioned; off never (criterion 3)", () => {
    const quiet = messageNotifications([msg()], ctx({ eventChat: "mentions" }))
    expect(quiet).toEqual([])
    const named = messageNotifications(
      [msg({ body: "@alex can you take Q14?" })],
      ctx({ eventChat: "mentions" })
    )
    expect(named).toHaveLength(1)
    expect(messageNotifications([msg()], ctx({ eventChat: "off" }))).toEqual([])
    expect(mentions("hey @Alex Rivera", "Alex Rivera")).toBe(true)
    expect(mentions("alexander", "Alex Rivera")).toBe(false)
  })

  it("muted channels stay quiet; DMs follow their own switch (criterion 4)", () => {
    expect(
      messageNotifications(
        [msg()],
        ctx({ mutedChannelIds: ["event:2026casj"] })
      )
    ).toEqual([])
    const dm = msg({ id: "d1", channelId: "dm:u-me:u-sam" })
    expect(messageNotifications([dm], ctx())[0]).toMatchObject({
      title: "Sam Chen",
      href: "/messages/dm:u-me:u-sam",
    })
    expect(messageNotifications([dm], ctx({ directMessages: false }))).toEqual(
      []
    )
  })

  it("announcements notify, urgent ones at high priority (criterion 5)", () => {
    const out = messageNotifications(
      [
        msg({ id: "a1", kind: "announcement", body: "Lunch at noon" }),
        msg({
          id: "a2",
          kind: "announcement",
          priority: "urgent",
          body: "Pits close",
        }),
      ],
      ctx()
    )
    expect(out.map((n) => [n.title, n.priority, n.href])).toEqual([
      ["Announcement", "normal", "/messages/announcements"],
      ["Urgent announcement", "high", "/messages/announcements"],
    ])
    expect(
      messageNotifications(
        [msg({ kind: "announcement" })],
        ctx({ announcements: false })
      )
    ).toEqual([])
  })

  it("long bodies are cut to 160 characters", () => {
    const [n] = messageNotifications([msg({ body: "x".repeat(300) })], ctx())
    expect(n?.body).toHaveLength(160)
    expect(n?.body.endsWith("…")).toBe(true)
  })
})

describe("match sources", () => {
  const MIN = 60_000
  const match = (o: Partial<SourceMatch> = {}): SourceMatch => ({
    key: "2026casj_qm14",
    label: "Qual 14",
    teamNumbers: [2276, 254, 1678, 971, 604, 846],
    redTeams: [2276, 254, 1678],
    startsAt: 1_000 * MIN,
    played: false,
    redScore: null,
    blueScore: null,
    ...o,
  })
  const soonCtx = (o = {}) => ({
    ourTeam: 2276,
    watched: [] as Array<number>,
    prefs,
    now: 1_000 * MIN - 8 * MIN,
    ...o,
  })

  it("our match within the lead time: one high notification (criterion 7)", () => {
    expect(matchSoonNotifications([match()], soonCtx())).toEqual([
      {
        key: "match-soon:2026casj_qm14",
        category: "events",
        priority: "high",
        title: "Our match soon: Qual 14",
        body: "Starts in 8 minutes. We're on the red alliance.",
        href: "/matches/2026casj_qm14",
      },
    ])
    expect(
      matchSoonNotifications(
        [match()],
        soonCtx({ now: 1_000 * MIN - 20 * MIN })
      )
    ).toEqual([])
    expect(
      matchSoonNotifications([match({ played: true })], soonCtx())
    ).toEqual([])
  })

  it("watched teams only with their switch on; ours wins when both", () => {
    const theirs = match({
      teamNumbers: [254, 1, 2, 3, 4, 5],
      redTeams: [254, 1, 2],
    })
    expect(
      matchSoonNotifications([theirs], soonCtx({ watched: [254] }))
    ).toEqual([])
    const on = { ...prefs, watchedMatchQueue: true }
    expect(
      matchSoonNotifications(
        [theirs],
        soonCtx({ watched: [254], prefs: on })
      )[0]
    ).toMatchObject({ priority: "normal", title: "254 plays soon: Qual 14" })
    expect(
      matchSoonNotifications(
        [match()],
        soonCtx({ prefs: { ...prefs, ourMatchQueue: false } })
      )
    ).toEqual([])
  })

  it("our results after we started watching, with the outcome", () => {
    const played = match({
      played: true,
      redScore: 88,
      blueScore: 70,
      startsAt: 500,
    })
    expect(
      matchResultNotifications([played], { ourTeam: 2276, since: 400, prefs })
    ).toEqual([
      {
        key: "match-result:2026casj_qm14",
        category: "events",
        priority: "normal",
        title: "We won Qual 14",
        body: "88 to 70",
        href: "/matches/2026casj_qm14",
      },
    ])
    expect(
      matchResultNotifications([played], { ourTeam: 2276, since: 600, prefs })
    ).toEqual([])
    expect(
      matchResultNotifications([played], {
        ourTeam: 2276,
        since: 400,
        prefs: { ...prefs, matchResults: false },
      })
    ).toEqual([])
  })
})
