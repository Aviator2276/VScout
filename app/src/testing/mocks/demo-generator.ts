// Settings → Admin → Demo Data (features/admin.md AD7a, FX-60): the mock API's generator for a
// shared demo event in the middle of qualifications. Invented teams (9001+), a full qual schedule
// around "now", results and rankings so far, match/pit/post scouting by several scouters (form data
// from the game module's descriptors, games/kit/demo.ts), comments, chat, announcements and a
// picklist for the admin who asked. Same seed → same event. Delete removes everything it made.
import { activeGame } from "@/config/game"
import { demoEntries, pick, seededRng } from "@/games/kit/demo"
import type { EntityName } from "@/lib/contracts/entities"
import { ENTITY_SCHEMAS } from "@/lib/contracts/entities"
import { mockBackend } from "./mock-backend"
import type { MadeRecord, MockRecord } from "./mock-backend"

export interface DemoOptions {
  seed: number
  /** 12–60 */
  teams: number
  /** share of the quals already played, 0–100 */
  playedPercent: number
  /** share of played robots someone scouted, 0–100 */
  coveragePercent: number
}

const DEMO_GAME = activeGame.id
const CYCLE_MS = 7 * 60_000
const STATIONS = ["red1", "red2", "red3", "blue1", "blue2", "blue3"] as const

const FIRST = [
  "Iron",
  "Robo",
  "Quantum",
  "Thunder",
  "Circuit",
  "Atomic",
  "Steel",
  "Nova",
  "Cyber",
  "Rocket",
  "Polar",
  "Solar",
]
const SECOND = [
  "Eagles",
  "Pandas",
  "Gears",
  "Owls",
  "Sparks",
  "Wolves",
  "Hornets",
  "Comets",
  "Beavers",
  "Knights",
  "Otters",
  "Falcons",
]
const CHAT = [
  "Anyone near the pits? 9007 swapped their intake.",
  "Q{n} looks close, watch the endgame.",
  "Lunch is at the stands, section C.",
  "9012 climbed in every match so far 👀",
  "Remember to fill in the post-match notes.",
  "Battery cart is back at the pit.",
]
const COMMENTS = [
  "Fast and smooth driver.",
  "Struggled to pick up game pieces from the floor.",
  "Very consistent auto.",
  "Defense slowed them down a lot.",
  "Great communication with partners.",
]

export const demoEventKey = (seed: number) => `2026demo${seed}`

/** What each demo event made, for Delete (kept on mockBackend so reset and saving cover it). */
const made = {
  has: (k: string) => mockBackend.demoEvents.has(k),
  get: (k: string) => mockBackend.demoEvents.get(k),
  set: (k: string, v: Array<MadeRecord>) => mockBackend.demoEvents.set(k, v),
  delete: (k: string) => mockBackend.demoEvents.delete(k),
}

function put(
  scope: string,
  entity: EntityName,
  record: Record<string, unknown>,
  eventKey: string
): MockRecord {
  const parsed = ENTITY_SCHEMAS[entity].parse(record) as MockRecord
  mockBackend.records.set(mockBackend.key(entity, parsed.id), parsed)
  mockBackend.append(scope, entity, {
    v: 1,
    entity,
    op: "upsert",
    id: parsed.id,
    rev: parsed.rev,
    eventKey: typeof parsed.eventKey === "string" ? parsed.eventKey : null,
    ts: parsed.updatedAt,
    data: parsed,
  })
  const list = made.get(eventKey) ?? []
  list.push({ scope, entity, id: parsed.id })
  made.set(eventKey, list)
  return parsed
}

export function createDemoEvent(
  o: DemoOptions,
  admin: { userId: string },
  scouterIds: ReadonlyArray<string>
): { eventKey: string; counts: Record<string, number> } {
  const rng = seededRng(o.seed)
  const ek = demoEventKey(o.seed)
  if (made.has(ek)) deleteDemoEvent(ek)
  const game = activeGame
  const now = Date.now()
  const at = (ms: number) => new Date(ms).toISOString()
  const stamp = mockBackend.now()
  const meta = (id: string) => ({ id, rev: 1, updatedAt: stamp })
  const owned = (id: string, authorId: string, createdAt = stamp) => ({
    ...meta(id),
    eventKey: ek,
    authorId,
    createdAt,
  })
  const counts: Record<string, number> = {}
  const count = (k: string) => (counts[k] = (counts[k] ?? 0) + 1)

  const today = at(now).slice(0, 10)
  put(
    "global",
    "event",
    {
      ...meta(ek),
      name: `Demo Regional #${o.seed}`,
      year: 2026,
      gameId: DEMO_GAME,
      eventType: "regional",
      startDate: today,
      endDate: at(now + 2 * 86_400_000).slice(0, 10),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isDemo: true,
    },
    ek
  )

  // teams, each with a hidden skill that shapes its results and its scouting data
  const teams = Array.from({ length: o.teams }, (_, i) => 9001 + i)
  const skill = new Map(teams.map((t) => [t, Math.round(rng() * 100) / 100]))
  for (const t of teams)
    put(
      "global",
      "team",
      {
        ...meta(String(t)),
        teamNumber: t,
        nickname: `${pick(rng, FIRST)} ${pick(rng, SECOND)}`,
        city: "Demo City",
      },
      ek
    )

  // a qual schedule: every team plays about ten times, six different robots per match
  const quals = Math.ceil((o.teams * 10) / 6)
  const played = Math.round((quals * o.playedPercent) / 100)
  const start = now - (played + 0.5) * CYCLE_MS
  const record = new Map(teams.map((t) => [t, { w: 0, l: 0, rp: 0 }]))
  const matches: Array<{
    key: string
    red: Array<number>
    blue: Array<number>
  }> = []
  let deck: Array<number> = []
  for (let n = 1; n <= quals; n++) {
    const six: Array<number> = []
    while (six.length < 6) {
      if (deck.length === 0) deck = [...teams].sort(() => rng() - 0.5)
      const t = deck.pop()
      if (t !== undefined && !six.includes(t)) six.push(t)
    }
    const red = six.slice(0, 3)
    const blue = six.slice(3)
    const isPlayed = n <= played
    const score = (a: Array<number>) =>
      Math.round(
        a.reduce((s, t) => s + 20 + (skill.get(t) ?? 0) * 40, 0) + rng() * 25
      )
    const redScore = isPlayed ? score(red) : null
    const blueScore = isPlayed ? score(blue) : null
    const winner =
      redScore === null || blueScore === null
        ? null
        : redScore >= blueScore
          ? "red"
          : "blue"
    if (winner)
      for (const t of six) {
        const r = record.get(t)
        if (!r) continue
        const won = (winner === "red") === red.includes(t)
        if (won) {
          r.w++
          r.rp += 2
        } else r.l++
      }
    const key = `${ek}_qm${n}`
    matches.push({ key, red, blue })
    put(
      `event:${ek}`,
      "match",
      {
        ...meta(key),
        eventKey: ek,
        compLevel: "qm",
        setNumber: 1,
        matchNumber: n,
        scheduledTime: at(start + n * CYCLE_MS),
        alliances: {
          red: { teamNumbers: red, surrogates: [], dqs: [], score: redScore },
          blue: {
            teamNumbers: blue,
            surrogates: [],
            dqs: [],
            score: blueScore,
          },
        },
        status: isPlayed
          ? "played"
          : n === played + 1
            ? "onField"
            : "scheduled",
        winningAlliance: winner,
      },
      ek
    )
    count("matches")
  }

  const ranked = [...teams].sort(
    (a, b) =>
      (record.get(b)?.rp ?? 0) - (record.get(a)?.rp ?? 0) ||
      (skill.get(b) ?? 0) - (skill.get(a) ?? 0)
  )
  ranked.forEach((t, i) =>
    put(
      `event:${ek}`,
      "eventTeam",
      {
        ...meta(`${ek}_${t}`),
        eventKey: ek,
        teamNumber: t,
        rank: played > 0 ? i + 1 : null,
      },
      ek
    )
  )

  // scouting by several scouters, some robots left for "Needs Scouting"
  const scouters = scouterIds.length ? scouterIds : [admin.userId]
  let id = 0
  const nextId = (kind: string) => `demo${o.seed}-${kind}-${++id}`
  matches.slice(0, played).forEach((m, i) => {
    STATIONS.forEach((station, s) => {
      if (rng() * 100 >= o.coveragePercent) return
      const t = (s < 3 ? m.red : m.blue)[s % 3]
      if (t === undefined) return
      const createdAt = at(start + (i + 1) * CYCLE_MS + 3 * 60_000)
      put(
        `event:${ek}`,
        "scoutEntry",
        {
          ...owned(nextId("entry"), pick(rng, scouters), createdAt),
          gameId: DEMO_GAME,
          schemaVersion: game.schemaVersion,
          data: demoEntries(game, rng, skill.get(t) ?? 0.5).match(),
          matchKey: m.key,
          teamNumber: t,
          station,
          scouterLevel: "experienced",
        },
        ek
      )
      count("scoutEntries")
    })
  })
  for (const t of teams) {
    if (rng() * 100 >= o.coveragePercent) continue
    const gen = demoEntries(game, rng, skill.get(t) ?? 0.5)
    put(
      `event:${ek}`,
      "pitScouting",
      {
        ...owned(nextId("pit"), pick(rng, scouters)),
        gameId: DEMO_GAME,
        schemaVersion: game.schemaVersion,
        data: gen.pit(),
        teamNumber: t,
        robot: {
          drivetrain: pick(rng, [
            "swerve",
            "swerve",
            "tank",
            "mecanum",
          ] as const),
          weightLb: Math.round(90 + rng() * 25),
        },
        photos: [],
      },
      ek
    )
    count("pitEntries")
    if (played > 0 && rng() < 0.5) {
      put(
        `event:${ek}`,
        "postScouting",
        {
          ...owned(nextId("post"), pick(rng, scouters)),
          gameId: DEMO_GAME,
          schemaVersion: game.schemaVersion,
          data: gen.post(),
          teamNumber: t,
        },
        ek
      )
      count("postEntries")
    }
    if (rng() < 0.3) {
      put(
        `event:${ek}`,
        "comment",
        {
          ...owned(nextId("comment"), pick(rng, scouters)),
          teamNumber: t,
          body: pick(rng, COMMENTS),
        },
        ek
      )
      count("comments")
    }
  }

  // chat and announcements, spread over the last hour
  const channel = `event:${ek}`
  const message = (
    body: string,
    kind: "message" | "announcement",
    minutesAgo: number,
    authorId: string,
    priority: "normal" | "urgent" = "normal"
  ) => {
    put(
      `event:${ek}`,
      "message",
      {
        ...owned(nextId("msg"), authorId, at(now - minutesAgo * 60_000)),
        channelId: channel,
        kind,
        body,
        priority,
      },
      ek
    )
    count(kind === "message" ? "messages" : "announcements")
  }
  message(
    "Welcome to the demo event! Everything here is made up.",
    "announcement",
    55,
    admin.userId
  )
  CHAT.forEach((body, i) =>
    message(
      body.replace("{n}", String(played + 2)),
      "message",
      50 - i * 8,
      pick(rng, scouters)
    )
  )
  message(
    `Drive team meeting after Q${played + 4}. Bring your notes.`,
    "announcement",
    5,
    admin.userId,
    "urgent"
  )

  // the admin's own first-pick list: the strongest robots, in order
  const listId = nextId("picklist")
  put(
    `event:${ek}`,
    "picklist",
    {
      ...owned(listId, admin.userId),
      ownerId: admin.userId,
      name: "First Pick (Demo)",
      purpose: "first",
    },
    ek
  )
  ;[...teams]
    .sort((a, b) => (skill.get(b) ?? 0) - (skill.get(a) ?? 0))
    .slice(0, 12)
    .forEach((t, i) =>
      put(
        `event:${ek}`,
        "picklistEntry",
        {
          ...owned(nextId("pick"), admin.userId),
          picklistId: listId,
          teamNumber: t,
          rank: `a${String(i).padStart(2, "0")}`,
        },
        ek
      )
    )
  count("picklists")

  return { eventKey: ek, counts }
}

/** Removes everything a demo event made: delete envelopes, so every device drops it. */
export function deleteDemoEvent(eventKey: string): boolean {
  const list = made.get(eventKey)
  if (!list) return false
  const ts = mockBackend.now()
  for (const r of [...list].reverse()) {
    const key = mockBackend.key(r.entity, r.id)
    const rev = (mockBackend.records.get(key)?.rev ?? 1) + 1
    mockBackend.records.delete(key)
    mockBackend.tombstones.set(key, rev)
    mockBackend.append(r.scope, r.entity, {
      v: 1,
      entity: r.entity,
      op: "delete",
      id: r.id,
      rev,
      eventKey: r.entity === "event" || r.entity === "team" ? null : eventKey,
      ts,
    })
  }
  made.delete(eventKey)
  return true
}
