// What notifies (features/notifications-center.md N2), as pure functions over plain inputs: the app
// layer feeds them new messages and the schedule, then stores what they return. They follow the
// synced userSettings.notifications switches, the same ones push uses.
import type { UserSettingsDocument } from "@/lib/contracts/user-settings"
import type { NotifyInput } from "../api/notifications-store"

type Prefs = UserSettingsDocument["notifications"]

const BODY_MAX = 160

/** Opening the announcements feed reads these. */
export const ANNOUNCEMENTS_GROUP = "announcements"

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > BODY_MAX ? `${flat.slice(0, BODY_MAX - 1)}…` : flat
}

export interface SourceMessage {
  id: string
  channelId: string
  kind: "message" | "announcement"
  priority: "normal" | "urgent"
  authorId: string
  body: string
  createdAt: number
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** `@First` or `@First Last`, any case, as a whole word. */
export function mentions(body: string, myName: string): boolean {
  const parts = myName.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]
  if (!first) return false
  const names = [parts.join(" "), first].map(escape)
  return new RegExp(`@(${names.join("|")})(?![\\p{L}\\p{N}])`, "iu").test(body)
}

export function messageNotifications(
  messages: ReadonlyArray<SourceMessage>,
  ctx: {
    me: string
    myName: string
    prefs: Prefs
    authorName: (userId: string) => string
    eventKey: string
  }
): Array<NotifyInput> {
  const { prefs } = ctx
  const out: Array<NotifyInput> = []
  for (const m of messages) {
    if (m.authorId === ctx.me) continue
    if (m.kind === "announcement") {
      if (!prefs.announcements) continue
      const urgent = m.priority === "urgent"
      out.push({
        key: `msg:${m.id}`,
        category: "messages",
        priority: urgent ? "high" : "normal",
        title: urgent ? "Urgent announcement" : "Announcement",
        body: clip(m.body),
        href: "/messages/announcements",
        group: ANNOUNCEMENTS_GROUP,
      })
      continue
    }
    if (prefs.mutedChannelIds.includes(m.channelId)) continue
    const dm = m.channelId.startsWith("dm:")
    if (dm ? !prefs.directMessages : !chatAllowed(m, ctx.myName, prefs))
      continue
    const author = ctx.authorName(m.authorId)
    out.push({
      key: `msg:${m.id}`,
      category: "messages",
      priority: "normal",
      title: dm ? author : `${author} in #${ctx.eventKey}`,
      body: clip(m.body),
      href: `/messages/${m.channelId}`,
      group: m.channelId,
    })
  }
  return out
}

function chatAllowed(m: SourceMessage, myName: string, prefs: Prefs): boolean {
  if (prefs.eventChat === "off") return false
  if (prefs.eventChat === "mentions") return mentions(m.body, myName)
  return true
}

export interface SourceMatch {
  key: string
  /** "Qual 14" */
  label: string
  teamNumbers: ReadonlyArray<number>
  redTeams: ReadonlyArray<number>
  /** predicted start, else scheduled; ms epoch */
  startsAt: number | null
  played: boolean
  redScore: number | null
  blueScore: number | null
}

const MIN = 60_000

/** Our (and watched teams') matches starting within the lead time. One per match. */
export function matchSoonNotifications(
  matches: ReadonlyArray<SourceMatch>,
  ctx: {
    ourTeam: number | null
    watched: ReadonlyArray<number>
    prefs: Prefs
    now: number
  }
): Array<NotifyInput> {
  const { prefs, now, ourTeam } = ctx
  const lead = prefs.matchLeadMinutes * MIN
  const out: Array<NotifyInput> = []
  for (const m of matches) {
    if (m.played || m.startsAt === null) continue
    const left = m.startsAt - now
    if (left <= 0 || left > lead) continue
    const minutes = Math.max(1, Math.round(left / MIN))
    const starts = `Starts in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`
    const ours = ourTeam !== null && m.teamNumbers.includes(ourTeam)
    if (ours) {
      if (!prefs.ourMatchQueue) continue
      const red = m.redTeams.includes(ourTeam)
      out.push({
        key: `match-soon:${m.key}`,
        category: "events",
        priority: "high",
        title: `Our match soon: ${m.label}`,
        body: `${starts} We're on the ${red ? "red" : "blue"} alliance.`,
        href: `/matches/${m.key}`,
      })
      continue
    }
    const team = ctx.watched.find((t) => m.teamNumbers.includes(t))
    if (team === undefined || !prefs.watchedMatchQueue) continue
    out.push({
      key: `match-soon:${m.key}`,
      category: "events",
      priority: "normal",
      title: `${team} plays soon: ${m.label}`,
      body: starts,
      href: `/matches/${m.key}`,
    })
  }
  return out
}

/** Our matches that got a score, if they started after the device began watching. */
export function matchResultNotifications(
  matches: ReadonlyArray<SourceMatch>,
  ctx: { ourTeam: number | null; since: number; prefs: Prefs }
): Array<NotifyInput> {
  const { ourTeam } = ctx
  if (ourTeam === null || !ctx.prefs.matchResults) return []
  const out: Array<NotifyInput> = []
  for (const m of matches) {
    if (!m.played || m.redScore === null || m.blueScore === null) continue
    if (!m.teamNumbers.includes(ourTeam)) continue
    if (m.startsAt === null || m.startsAt <= ctx.since) continue
    const red = m.redTeams.includes(ourTeam)
    const ours = red ? m.redScore : m.blueScore
    const theirs = red ? m.blueScore : m.redScore
    const outcome = ours > theirs ? "won" : ours < theirs ? "lost" : "tied"
    out.push({
      key: `match-result:${m.key}`,
      category: "events",
      priority: "normal",
      title: `We ${outcome} ${m.label}`,
      body: `${ours} to ${theirs}`,
      href: `/matches/${m.key}`,
    })
  }
  return out
}
